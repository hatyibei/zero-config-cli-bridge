export interface ExecuteResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
/**
 * Executes a binary directly with an args array.
 * NO shell intermediary — shell injection is structurally impossible.
 */
export declare function executeCommand(bin: string, args: string[]): Promise<ExecuteResult>;
//# sourceMappingURL=executor.d.ts.map