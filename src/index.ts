import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { executeCommand } from './executor.js';
import { validateSubcommand, validateArgs } from './security.js';
import { buildToolDefinitions, buildGhArgs, ToolDefinition } from './schema.js';

const MAX_JSON_ITEMS = 30;
const MAX_TEXT_CHARS = 2000;

/**
 * Response envelope — every tool call returns this shape.
 *
 * Guarantees:
 *   - The full response is always valid, parseable JSON.
 *   - Truncation metadata is carried inside the structure, never appended
 *     as raw text after a closing brace (which would invalidate JSON).
 *   - Non-array JSON objects are size-capped at MAX_TEXT_CHARS serialised
 *     characters to prevent context exhaustion from unbounded objects.
 */
interface ToolEnvelope {
  data: unknown;
  meta: {
    truncated: boolean;
    returnedItems?: number;
    note?: string;
    error?: string;
  };
}

function toEnvelope(raw: string): ToolEnvelope {
  // --- JSON path ---
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Non-JSON (error messages, plain text)
    const text = raw.length > MAX_TEXT_CHARS
      ? raw.slice(0, MAX_TEXT_CHARS) + '...[truncated]'
      : raw;
    return {
      data: null,
      meta: { truncated: raw.length > MAX_TEXT_CHARS, error: text },
    };
  }

  // Array response: truncate at item level
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

  // Non-array JSON object: cap by serialised size
  const serialised = JSON.stringify(parsed);
  if (serialised.length > MAX_TEXT_CHARS) {
    return {
      data: null,
      meta: {
        truncated: true,
        error: `Response object too large (${serialised.length} chars). Use filters to narrow results.`,
      },
    };
  }

  return { data: parsed, meta: { truncated: false } };
}

const server = new Server(
  { name: 'zero-config-cli-bridge', version: '1.3.0' },
  { capabilities: { tools: {} } }
);

let toolRegistry = new Map<string, ToolDefinition>();

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
  if (!tool) {
    const envelope: ToolEnvelope = {
      data: null,
      meta: { truncated: false, error: `Unknown tool "${toolName}".` },
    };
    return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }], isError: true };
  }

  // Security: whitelist subcommand + validate arg values
  try {
    validateSubcommand(tool.subcommand.join(' '));
    validateArgs(args);
  } catch (err) {
    const envelope: ToolEnvelope = {
      data: null,
      meta: { truncated: false, error: err instanceof Error ? err.message : String(err) },
    };
    return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }], isError: true };
  }

  // Direct spawn — no shell, no injection surface
  const ghArgs = buildGhArgs(tool, args);

  let result;
  try {
    result = await executeCommand('gh', ghArgs);
  } catch (err) {
    const envelope: ToolEnvelope = {
      data: null,
      meta: { truncated: false, error: `Execution error: ${err instanceof Error ? err.message : String(err)}` },
    };
    return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }], isError: true };
  }

  const raw = result.stdout || result.stderr || '';
  const envelope = toEnvelope(raw);

  return {
    content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
    isError: result.exitCode !== 0,
  };
});

async function main() {
  const tools = await buildToolDefinitions();
  toolRegistry = new Map(tools.map((t) => [t.name, t]));

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
