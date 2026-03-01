import { createServer, IncomingMessage, ServerResponse } from 'http';
import { exec } from 'child_process';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';

const APPROVAL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes — deny on timeout

// ── Platform detection ──────────────────────────────────────────────────────

type Platform = 'mac' | 'windows' | 'wsl' | 'linux';

function detectPlatform(): Platform {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'win32') return 'windows';
  try {
    const v = readFileSync('/proc/version', 'utf-8').toLowerCase();
    if (v.includes('microsoft') || v.includes('wsl')) return 'wsl';
  } catch { /* not Linux or /proc unavailable */ }
  return 'linux';
}

function openBrowser(url: string): void {
  const p = detectPlatform();
  // WSL: explorer.exe is the most reliable path to the Windows default browser
  const cmd =
    p === 'mac'     ? `open '${url}'` :
    p === 'windows' ? `start "" "${url}"` :
    p === 'wsl'     ? `explorer.exe '${url}'` :
                      `xdg-open '${url}' || sensible-browser '${url}'`;
  exec(cmd, (err) => {
    if (err) {
      process.stderr.write(`\x1b[33mCould not open browser automatically.\x1b[0m\n`);
    }
  });
}

// ── Port discovery ──────────────────────────────────────────────────────────

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : null;
      s.close(() => {
        if (port) resolve(port);
        else reject(new Error('Could not determine free port'));
      });
    });
    s.on('error', reject);
  });
}

// ── Approval UI ─────────────────────────────────────────────────────────────

function approvalPage(preview: string, token: string): string {
  const safe = preview.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Agent Approval Required</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 640px;
           margin: 60px auto; padding: 0 24px; color: #1e293b; }
    h1   { color: #b45309; margin-bottom: 8px; }
    p    { color: #475569; line-height: 1.6; }
    pre  { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px;
           padding: 16px; font-size: 13px; overflow-x: auto; white-space: pre-wrap; }
    .row { display: flex; gap: 12px; margin-top: 28px; }
    button { flex: 1; padding: 14px; font-size: 15px; font-weight: 600;
             border: none; border-radius: 8px; cursor: pointer; transition: opacity .15s; }
    button:hover { opacity: .82; }
    .ok  { background: #16a34a; color: #fff; }
    .no  { background: #dc2626; color: #fff; }
  </style>
</head>
<body>
  <h1>⚠️ Agent Approval Required</h1>
  <p>An AI agent is requesting permission to execute a <strong>write operation</strong>
     using your local GitHub credentials:</p>
  <pre>${safe}</pre>
  <p>Approve only if you initiated this action and understand its consequences.</p>
  <div class="row">
    <form method="POST" action="/approve/${token}" style="flex:1">
      <button class="ok" type="submit">✓ Approve</button>
    </form>
    <form method="POST" action="/deny/${token}" style="flex:1">
      <button class="no" type="submit">✗ Deny</button>
    </form>
  </div>
</body>
</html>`;
}

function donePage(approved: boolean): string {
  const [icon, color, msg] = approved
    ? ['✓', '#16a34a', 'Approved — operation is executing.']
    : ['✗', '#dc2626', 'Denied — operation was cancelled.'];
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Done</title></head>
<body style="font-family:system-ui;text-align:center;padding:60px;color:${color}">
<h1 style="font-size:64px;margin:0">${icon}</h1>
<p style="font-size:20px">${msg}</p>
<p style="color:#64748b">You can close this tab.</p>
</body></html>`;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * True server-side Human-in-the-Loop gate for headless MCP environments.
 *
 * When Claude Desktop (or any MCP client) spawns this server as a background
 * process, there is no TTY attached. This function:
 *   1. Binds a temporary HTTP server on a random localhost port.
 *   2. Opens the system browser to the approval page.
 *   3. Blocks until the human clicks Approve or Deny — the MCP response
 *      is held pending; the agent receives nothing in the meantime.
 *   4. Denies by default on timeout (2 min) or server error.
 *
 * The one-time token in the URL prevents other localhost processes from
 * silently approving or denying without user interaction.
 */
export async function requestApproval(preview: string): Promise<boolean> {
  const token = randomBytes(24).toString('hex');
  const port  = await findFreePort();
  const base  = `http://127.0.0.1:${port}`;
  const url   = `${base}/${token}`;

  return new Promise((resolve) => {
    let settled = false;

    const settle = (approved: boolean, res?: ServerResponse) => {
      if (settled) return;
      settled = true;

      if (res) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(donePage(approved));
      }

      // Give browser time to receive the response page before closing server
      setTimeout(() => server.close(), 500);

      process.stderr.write(
        approved
          ? '\x1b[32m✓ Approved — executing write operation.\x1b[0m\n\n'
          : '\x1b[31m✗ Denied — write operation cancelled.\x1b[0m\n\n',
      );
      resolve(approved);
    };

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'GET' && req.url === `/${token}`) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(approvalPage(preview, token));
        return;
      }
      if (req.method === 'POST' && req.url === `/approve/${token}`) {
        settle(true, res);
        return;
      }
      if (req.method === 'POST' && req.url === `/deny/${token}`) {
        settle(false, res);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    server.listen(port, '127.0.0.1', () => {
      process.stderr.write(
        '\n\x1b[33m━━━ APPROVAL REQUIRED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n' +
        `\x1b[1m${preview}\x1b[0m\n\n` +
        `Opening browser for approval…\n` +
        `If the browser does not open, visit:\n  \x1b[36m${url}\x1b[0m\n` +
        `Waiting (timeout 2 min — deny on timeout)…\n`,
      );
      openBrowser(url);
    });

    server.on('error', (err) => {
      process.stderr.write(`Approval server error: ${err.message}\n`);
      settle(false);
    });

    setTimeout(() => {
      if (!settled) {
        process.stderr.write('\x1b[31mApproval timed out — denied by default.\x1b[0m\n');
        settle(false);
      }
    }, APPROVAL_TIMEOUT_MS);
  });
}
