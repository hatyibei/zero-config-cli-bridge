import { spawn } from 'child_process';
// Raw character cap — fires only for non-JSON (error messages, plain text).
// Structured JSON output is truncated at the item level in index.ts.
const MAX_OUTPUT_CHARS = 10_000_000; // 10 MB hard ceiling
const TRUNCATION_MSG = '\n...[Output truncated. Use grep/jq to filter]';
const TIMEOUT_MS = 15_000;
function truncate(s) {
    if (s.length <= MAX_OUTPUT_CHARS)
        return s;
    return s.slice(0, MAX_OUTPUT_CHARS) + TRUNCATION_MSG;
}
/**
 * Executes a binary directly with an args array.
 * NO shell intermediary — shell injection is structurally impossible.
 */
export function executeCommand(bin, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(bin, args, {
            env: { ...process.env, CI: 'true' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdoutBuf = '';
        let stderrBuf = '';
        proc.stdout.on('data', (chunk) => { stdoutBuf += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderrBuf += chunk.toString(); });
        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error(`Command timed out after ${TIMEOUT_MS}ms`));
        }, TIMEOUT_MS);
        proc.on('close', (code) => {
            clearTimeout(timer);
            resolve({
                stdout: truncate(stdoutBuf),
                stderr: truncate(stderrBuf),
                exitCode: code ?? 1,
            });
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
//# sourceMappingURL=executor.js.map