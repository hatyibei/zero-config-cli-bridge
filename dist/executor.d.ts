export interface ExecuteResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export declare function executeCommand(command: string): Promise<ExecuteResult>;
//# sourceMappingURL=executor.d.ts.map