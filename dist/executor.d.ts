export interface ExecuteResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
/**
 * Executes a binary directly with an args array.
 * NO shell intermediary — shell injection is structurally impossible.
 *
 * stdout is accumulated faithfully up to MAX_STDOUT_BYTES.
 * If the ceiling is hit, the subprocess is killed with SIGKILL and the
 * promise rejects — callers route this to an error envelope.
 */
export declare function executeCommand(bin: string, args: string[], timeoutMs?: number): Promise<ExecuteResult>;
//# sourceMappingURL=executor.d.ts.map