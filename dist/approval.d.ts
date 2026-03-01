/**
 * True server-side Human-in-the-Loop gate.
 *
 * The MCP connection stays pending (agent receives nothing) until a human
 * physically types 'y' at the terminal where this server runs.
 *
 * Uses /dev/tty for input — stdin is occupied by the MCP protocol and must
 * not be consumed. /dev/tty provides direct TTY access regardless of how
 * stdin/stdout are redirected, exactly as sudo(8) and ssh(1) do.
 *
 * If no TTY is available (headless server, CI environment), the request is
 * denied by default — fail-closed, not fail-open.
 */
export declare function requestApproval(preview: string): Promise<boolean>;
//# sourceMappingURL=approval.d.ts.map