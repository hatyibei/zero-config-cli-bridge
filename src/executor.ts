import { spawn } from 'child_process';

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAX_OUTPUT = 2000;
const TRUNCATION_MSG = '\n...[Output truncated. Use grep/jq to filter]';
const TIMEOUT_MS = 3000;

function truncate(output: string): string {
  if (output.length <= MAX_OUTPUT) return output;
  return output.slice(0, MAX_OUTPUT) + TRUNCATION_MSG;
}

export function executeCommand(command: string): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('sh', ['-c', command], {
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`Command timed out after ${TIMEOUT_MS}ms: ${command}`));
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
