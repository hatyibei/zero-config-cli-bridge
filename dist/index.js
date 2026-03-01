#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from './executor.js';
const MAX_JSON_ITEMS = 30;
const TRUNCATION_MSG = `\n...[Output truncated at ${MAX_JSON_ITEMS} items. Use --limit or filters to narrow results.]`;
/**
 * Ensures the output returned to the LLM is always valid JSON.
 * If the output is a JSON array, caps it at MAX_JSON_ITEMS to prevent
 * context exhaustion. Falls back to raw text if parsing fails.
 */
function toJsonOutput(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            if (parsed.length > MAX_JSON_ITEMS) {
                return JSON.stringify(parsed.slice(0, MAX_JSON_ITEMS), null, 2) + TRUNCATION_MSG;
            }
            return JSON.stringify(parsed, null, 2);
        }
        return JSON.stringify(parsed, null, 2);
    }
    catch {
        return raw; // non-JSON response (errors, etc.) returned as-is
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
    const output = toJsonOutput(raw);
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