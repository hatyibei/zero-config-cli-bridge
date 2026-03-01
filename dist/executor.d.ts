export interface ExecuteResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
declare const TIMEOUT_MS_PROBE = 5000;
export { TIMEOUT_MS_PROBE };
/**
 * Executes a binary directly with an args array.
 * NO shell intermediary — shell injection is structurally impossible.
 * stdout is passed through unmodified; item-level truncation is the caller's responsibility.
 */
export declare function executeCommand(bin: string, args: string[], timeoutMs?: number): Promise<ExecuteResult>;
//# sourceMappingURL=executor.d.ts.map