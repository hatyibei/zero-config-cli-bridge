import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { executeCommand } from './executor.js';
import { validateReadOnly } from './security.js';
import { buildGhCommand, getToolDefinitions } from './schema.js';

const server = new Server(
  { name: 'zero-config-cli-bridge', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: getToolDefinitions() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name: toolName, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  const command = buildGhCommand(toolName, args);

  // Security check: block mutating commands
  try {
    validateReadOnly(command);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: msg }],
      isError: true,
    };
  }

  // Execute command
  let result;
  try {
    result = await executeCommand(command);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Execution error: ${msg}` }],
      isError: true,
    };
  }

  const output =
    result.stdout ||
    result.stderr ||
    `(no output, exit code ${result.exitCode})`;

  const isError = result.exitCode !== 0;

  return {
    content: [{ type: 'text', text: output }],
    isError,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server is running on stdio - no console output to avoid corrupting MCP protocol
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
