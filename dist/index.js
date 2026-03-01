#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from './executor.js';
import { validateSubcommand, validateArgs } from './security.js';
import { buildToolDefinitions, buildGhArgs } from './schema.js';
const MAX_JSON_ITEMS = 30;
const MAX_SERIALISED_CHARS = 200_000; // 200 KB cap for non-array JSON objects
/**
 * Converts gh stdout (JSON) into a bounded, always-valid envelope.
 * Called only when exitCode === 0.
 *
 * stdout is passed unmodified from executor — no byte-level truncation
 * has occurred. item-level truncation is the sole guard here.
 */
function stdoutToEnvelope(stdout) {
    if (!stdout.trim()) {
        return { data: [], meta: { truncated: false, returnedItems: 0 } };
    }
    let parsed;
    try {
        parsed = JSON.parse(stdout);
    }
    catch {
        // gh returned non-JSON despite --json flag (should not happen in normal operation)
        return {
            data: null,
            meta: {
                truncated: false,
                error: `Unexpected non-JSON output from gh: ${stdout.slice(0, 200)}`,
            },
        };
    }
    // Array response: truncate at item level — primary case for list commands
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
    // Non-array JSON object: guard against unbounded size
    const serialised = JSON.stringify(parsed);
    if (serialised.length > MAX_SERIALISED_CHARS) {
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
/**
 * Wraps an error string in the standard envelope.
 * stderr is already bounded to 4KB by executor.
 */
function stderrToEnvelope(stderr, stdout) {
    const error = (stderr || stdout || 'Command failed with no output').trim();
    return { data: null, meta: { truncated: false, error } };
}
function envelopeToResponse(envelope, isError) {
    return {
        content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
        isError,
    };
}
// Tool registry is synchronously populated at startup — no subprocess calls.
const tools = buildToolDefinitions();
const toolRegistry = new Map(tools.map((t) => [t.name, t]));
const server = new Server({ name: 'zero-config-cli-bridge', version: '1.4.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Array.from(toolRegistry.values()).map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
    })),
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {});
    const tool = toolRegistry.get(toolName);
    if (!tool) {
        return envelopeToResponse({ data: null, meta: { truncated: false, error: `Unknown tool "${toolName}".` } }, true);
    }
    // Security: whitelist subcommand + validate arg values
    try {
        validateSubcommand(tool.subcommand.join(' '));
        validateArgs(args);
    }
    catch (err) {
        return envelopeToResponse({ data: null, meta: { truncated: false, error: err instanceof Error ? err.message : String(err) } }, true);
    }
    // Direct spawn — no shell, no injection surface
    const ghArgs = buildGhArgs(tool, args);
    let result;
    try {
        result = await executeCommand('gh', ghArgs);
    }
    catch (err) {
        return envelopeToResponse({ data: null, meta: { truncated: false, error: `Execution error: ${err instanceof Error ? err.message : String(err)}` } }, true);
    }
    // stdout and stderr are semantically distinct:
    //   exitCode === 0 → stdout is structured JSON data; stderr is ignored warnings
    //   exitCode !== 0 → stderr is the error message; stdout is typically empty
    if (result.exitCode !== 0) {
        return envelopeToResponse(stderrToEnvelope(result.stderr, result.stdout), true);
    }
    return envelopeToResponse(stdoutToEnvelope(result.stdout), false);
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    process.stderr.write(`Fatal error: ${err}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map