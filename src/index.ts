import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { executeCommand } from './executor.js';
import { getOperationTier, validateArgs } from './security.js';
import { buildToolDefinitions, buildGhArgs, buildCommandPreview, ToolDefinition } from './schema.js';
import { requestApproval } from './approval.js';

const MAX_JSON_ITEMS = 30;
const MAX_SERIALISED_CHARS = 200_000;

interface ToolEnvelope {
  data: unknown;
  meta: {
    truncated: boolean;
    returnedItems?: number;
    note?: string;
    error?: string;
  };
}

/**
 * Converts gh stdout (always JSON when --json flag is used) into a bounded envelope.
 * Called only on exitCode === 0.
 */
function stdoutToEnvelope(stdout: string): ToolEnvelope {
  if (!stdout.trim()) {
    return { data: [], meta: { truncated: false, returnedItems: 0 } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      data: null,
      meta: { truncated: false, error: `Unexpected non-JSON output: ${stdout.slice(0, 200)}` },
    };
  }

  if (Array.isArray(parsed)) {
    const truncated = parsed.length > MAX_JSON_ITEMS;
    const data = truncated ? parsed.slice(0, MAX_JSON_ITEMS) : parsed;
    return {
      data,
      meta: {
        truncated,
        returnedItems: data.length,
        ...(truncated
          ? { note: `Showing first ${MAX_JSON_ITEMS} items. Use --limit or filters to narrow results.` }
          : {}),
      },
    };
  }

  // Non-array (e.g. single created resource from write command)
  const serialised = JSON.stringify(parsed);
  if (serialised.length > MAX_SERIALISED_CHARS) {
    return {
      data: null,
      meta: { truncated: true, error: `Response too large (${serialised.length} chars).` },
    };
  }

  return { data: parsed, meta: { truncated: false } };
}

function stderrToEnvelope(stderr: string, stdout: string): ToolEnvelope {
  const error = (stderr || stdout || 'Command failed with no output').trim();
  return { data: null, meta: { truncated: false, error } };
}

function envelopeResponse(envelope: ToolEnvelope, isError: boolean) {
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
    isError,
  };
}

function errorEnvelope(message: string) {
  return envelopeResponse(
    { data: null, meta: { truncated: false, error: message } },
    true,
  );
}

// Tool registry populated synchronously at startup — no subprocess overhead.
const tools = buildToolDefinitions();
const toolRegistry = new Map<string, ToolDefinition>(tools.map((t) => [t.name, t]));

const server = new Server(
  { name: 'zero-config-cli-bridge', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Array.from(toolRegistry.values()).map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  const tool = toolRegistry.get(toolName);
  if (!tool) return errorEnvelope(`Unknown tool "${toolName}".`);

  // Security: verify subcommand is in allow-list and get its tier
  let tier: 0 | 2 | 3;
  try {
    validateArgs(args);
    tier = getOperationTier(tool.subcommand.join(' '));
  } catch (err) {
    return errorEnvelope(err instanceof Error ? err.message : String(err));
  }

  // Tier 3: never executes (not exposed as tools, but guard defensively)
  if (tier === 3) {
    return errorEnvelope('Irreversible operations are not permitted.');
  }

  // Tier 2: block until human physically approves at the terminal
  if (tier === 2) {
    const preview = buildCommandPreview(tool, args);
    const approved = await requestApproval(preview);
    if (!approved) {
      return errorEnvelope('Operation denied by human operator.');
    }
  }

  // Execute — direct spawn, no shell
  const ghArgs = buildGhArgs(tool, args);
  let result;
  try {
    result = await executeCommand('gh', ghArgs);
  } catch (err) {
    return errorEnvelope(`Execution error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (result.exitCode !== 0) {
    return envelopeResponse(stderrToEnvelope(result.stderr, result.stdout), true);
  }

  return envelopeResponse(stdoutToEnvelope(result.stdout), false);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
