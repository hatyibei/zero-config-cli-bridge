import { spawn } from 'child_process';

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Raw character cap — fires only for non-JSON (error messages, plain text).
// Structured JSON output is truncated at the item level in index.ts.
const MAX_OUTPUT_CHARS = 10_000_000; // 10 MB hard ceiling
const TRUNCATION_MSG = '\n...[Output truncated. Use grep/jq to filter]';
const TIMEOUT_MS = 15_000;

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return s.slice(0, MAX_OUTPUT_CHARS) + TRUNCATION_MSG;
}

/**
 * Executes a binary directly with an args array.
 * NO shell intermediary — shell injection is structurally impossible.
 */
export function executeCommand(bin: string, args: string[]): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, {
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdoutBuf += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Command timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      resolve({
        stdout: truncate(stdoutBuf),
        stderr: truncate(stderrBuf),
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
