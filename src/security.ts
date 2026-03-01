/**
 * Security layer.
 *
 * With direct spawn(bin, args[]) there is no shell to inject into.
 * This layer provides defense-in-depth by:
 *   1. Whitelisting the exact subcommand paths allowed to execute.
 *   2. Validating individual argument values for anomalous content.
 */

/** Only these gh subcommand paths may execute. */
const ALLOWED_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'issue list',
  'pr list',
]);

export function validateSubcommand(subcommand: string): void {
  if (!ALLOWED_SUBCOMMANDS.has(subcommand)) {
    throw new Error(
      `Error: Subcommand "${subcommand}" is not in the read-only allow-list.`
    );
  }
}

export function validateArgs(args: Record<string, unknown>): void {
  for (const [, val] of Object.entries(args)) {
    if (typeof val === 'string') {
      if (val.includes('\0')) {
        throw new Error('Error: Null byte detected in argument value.');
      }
      if (val.length > 512) {
        throw new Error('Error: Argument value exceeds maximum length (512).');
      }
    }
  }
}
