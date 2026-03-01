import { spawn } from 'child_process';

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// stdout carries structured JSON from --json flag.
// Truncating it at byte level would corrupt the JSON before index.ts can parse it.
// NO limit on stdout — item-level truncation in index.ts is the sole guard.
//
// stderr carries error messages and diagnostic text (human-readable, bounded).
const MAX_STDERR_CHARS = 4_096;
const TIMEOUT_MS = 15_000;

const TIMEOUT_MS_PROBE = 5_000; // shorter timeout for capability probe calls

export { TIMEOUT_MS_PROBE };

function truncateStderr(s: string): string {
  if (s.length <= MAX_STDERR_CHARS) return s;
  return s.slice(0, MAX_STDERR_CHARS) + '\n...[stderr truncated]';
}

/**
 * Executes a binary directly with an args array.
 * NO shell intermediary — shell injection is structurally impossible.
 * stdout is passed through unmodified; item-level truncation is the caller's responsibility.
 */
export function executeCommand(
  bin: string,
  args: string[],
  timeoutMs: number = TIMEOUT_MS,
): Promise<ExecuteResult> {
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
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      resolve({
        stdout: stdoutBuf,                    // unmodified
        stderr: truncateStderr(stderrBuf),    // bounded
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
