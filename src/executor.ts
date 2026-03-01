import { spawn } from 'child_process';

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// stdout carries structured JSON. Byte-level truncation corrupts JSON structure,
// so we monitor cumulative size and kill the process if it exceeds the ceiling.
// At that point we reject — index.ts routes the error through the envelope.
//
// Practical ceiling: STATIC_FIELDS × 30 items ≈ 300 KB in normal operation.
// 5 MB is unreachable in normal use and prevents OOM from runaway output.
const MAX_STDOUT_BYTES = 5 * 1024 * 1024; // 5 MB

// stderr carries error messages (human-readable, bounded by design).
const MAX_STDERR_CHARS = 4_096;

const TIMEOUT_MS = 15_000;

function truncateStderr(s: string): string {
  if (s.length <= MAX_STDERR_CHARS) return s;
  return s.slice(0, MAX_STDERR_CHARS) + '\n...[stderr truncated]';
}

/**
 * Executes a binary directly with an args array.
 * NO shell intermediary — shell injection is structurally impossible.
 *
 * stdout is accumulated faithfully up to MAX_STDOUT_BYTES.
 * If the ceiling is hit, the subprocess is killed with SIGKILL and the
 * promise rejects — callers route this to an error envelope.
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
    let sizeExceeded = false;

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      if (stdoutBuf.length > MAX_STDOUT_BYTES) {
        sizeExceeded = true;
        proc.kill('SIGKILL');
      }
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (sizeExceeded) {
        reject(new Error(`stdout exceeded ${MAX_STDOUT_BYTES}-byte limit. Use --limit or filters to reduce output.`));
        return;
      }
      resolve({
        stdout: stdoutBuf,
        stderr: truncateStderr(stderrBuf),
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
