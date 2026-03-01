import { spawn } from 'child_process';

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// stdout carries structured JSON — large ceiling so index.ts can apply item-level truncation.
const MAX_STDOUT_CHARS = 2_000_000; // 2 MB
// stderr carries error messages and probe text — keep tight.
const MAX_STDERR_CHARS = 4_096;
const RAW_TRUNCATION_MSG = '\n...[Output truncated. Use grep/jq to filter]';
const TIMEOUT_MS = 15_000;

function truncate(s: string, limit: number): string {
  if (s.length <= limit) return s;
  return s.slice(0, limit) + RAW_TRUNCATION_MSG;
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
        stdout: truncate(stdoutBuf, MAX_STDOUT_CHARS),
        stderr: truncate(stderrBuf, MAX_STDERR_CHARS),
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
