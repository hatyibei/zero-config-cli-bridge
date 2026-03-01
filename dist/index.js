#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from './executor.js';
const MAX_JSON_ITEMS = 30;
const JSON_TRUNCATION_MSG = `\n...[Output truncated at ${MAX_JSON_ITEMS} items. Use --limit or filters to narrow results.]`;
const MAX_TEXT_CHARS = 2000;
const TEXT_TRUNCATION_MSG = '\n...[Output truncated. Use grep/jq to filter]';
/**
 * Normalises command output for LLM consumption.
 *
 * JSON path  : caps array at MAX_JSON_ITEMS — always returns valid JSON.
 * Text path  : caps at MAX_TEXT_CHARS — prevents context exhaustion on
 *              error messages and plain-text fallback output.
 *
 * The executor's MAX_RAW_CHARS (4096) is an independent backstop that fires
 * only if this function is somehow bypassed (e.g. future code paths).
 */
function toSafeOutput(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            if (parsed.length > MAX_JSON_ITEMS) {
                return JSON.stringify(parsed.slice(0, MAX_JSON_ITEMS), null, 2) + JSON_TRUNCATION_MSG;
            }
            return JSON.stringify(parsed, null, 2);
        }
        return JSON.stringify(parsed, null, 2);
    }
    catch {
        // Non-JSON: error messages, plain text — apply character cap
        if (raw.length > MAX_TEXT_CHARS) {
            return raw.slice(0, MAX_TEXT_CHARS) + TEXT_TRUNCATION_MSG;
        }
        return raw;
    }
}
import { validateSubcommand, validateArgs } from './security.js';
import { buildToolDefinitions, buildGhArgs } from './schema.js';
const server = new Server({ name: 'zero-config-cli-bridge', version: '1.1.0' }, { capabilities: { tools: {} } });
let toolRegistry = new Map();
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
        return {
            content: [{ type: 'text', text: `Error: Unknown tool "${toolName}".` }],
            isError: true,
        };
    }
    // Security: whitelist subcommand + validate arg values
    try {
        validateSubcommand(tool.subcommand.join(' '));
        validateArgs(args);
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
            isError: true,
        };
    }
    // Direct spawn — no shell, no injection surface
    const ghArgs = buildGhArgs(tool, args);
    let result;
    try {
        result = await executeCommand('gh', ghArgs);
    }
    catch (err) {
        return {
            content: [{ type: 'text', text: `Execution error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
        };
    }
    const raw = result.stdout || result.stderr || `(no output, exit code ${result.exitCode})`;
    const output = toSafeOutput(raw);
    return {
        content: [{ type: 'text', text: output }],
        isError: result.exitCode !== 0,
    };
});
async function main() {
    // Probe local gh binary for available capabilities before accepting requests
    const tools = await buildToolDefinitions();
    toolRegistry = new Map(tools.map((t) => [t.name, t]));
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((err) => {
    process.stderr.write(`Fatal error: ${err}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map