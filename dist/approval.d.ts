/**
 * True server-side Human-in-the-Loop gate for headless MCP environments.
 *
 * When Claude Desktop (or any MCP client) spawns this server as a background
 * process, there is no TTY attached. This function:
 *   1. Binds a temporary HTTP server on a random localhost port.
 *   2. Opens the system browser to the approval page.
 *   3. Blocks until the human clicks Approve or Deny — the MCP response
 *      is held pending; the agent receives nothing in the meantime.
 *   4. Denies by default on timeout (2 min) or server error.
 *
 * The one-time token in the URL prevents other localhost processes from
 * silently approving or denying without user interaction.
 */
export declare function requestApproval(preview: string): Promise<boolean>;
//# sourceMappingURL=approval.d.ts.map