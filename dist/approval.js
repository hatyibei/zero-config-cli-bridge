import { createReadStream } from 'fs';
import { createInterface } from 'readline';
/**
 * True server-side Human-in-the-Loop gate.
 *
 * The MCP connection stays pending (agent receives nothing) until a human
 * physically types 'y' at the terminal where this server runs.
 *
 * Uses /dev/tty for input — stdin is occupied by the MCP protocol and must
 * not be consumed. /dev/tty provides direct TTY access regardless of how
 * stdin/stdout are redirected, exactly as sudo(8) and ssh(1) do.
 *
 * If no TTY is available (headless server, CI environment), the request is
 * denied by default — fail-closed, not fail-open.
 */
export async function requestApproval(preview) {
    process.stderr.write('\n\x1b[33m━━━ APPROVAL REQUIRED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n' +
        '\x1b[33mAn agent wants to execute a write operation:\x1b[0m\n\n' +
        `  \x1b[1m${preview}\x1b[0m\n\n` +
        'Type \x1b[32my\x1b[0m to approve, anything else to deny: ');
    return new Promise((resolve) => {
        let tty = null;
        try {
            tty = createReadStream('/dev/tty');
        }
        catch {
            process.stderr.write('\x1b[31mNo TTY available — denied by default.\x1b[0m\n');
            resolve(false);
            return;
        }
        const rl = createInterface({ input: tty });
        rl.once('line', (line) => {
            rl.close();
            tty?.destroy();
            const approved = line.trim().toLowerCase() === 'y';
            process.stderr.write(approved
                ? '\x1b[32m✓ Approved — executing.\x1b[0m\n'
                : '\x1b[31m✗ Denied — operation cancelled.\x1b[0m\n');
            resolve(approved);
        });
        tty.on('error', () => {
            rl.close();
            process.stderr.write('\x1b[31mTTY error — denied by default.\x1b[0m\n');
            resolve(false);
        });
    });
}
//# sourceMappingURL=approval.js.map