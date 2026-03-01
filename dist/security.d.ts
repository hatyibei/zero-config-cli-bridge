/**
 * Security layer.
 *
 * With direct spawn(bin, args[]) there is no shell to inject into.
 * This layer provides defense-in-depth by:
 *   1. Whitelisting the exact subcommand paths allowed to execute.
 *   2. Validating individual argument values for anomalous content.
 */
export declare function validateSubcommand(subcommand: string): void;
export declare function validateArgs(args: Record<string, unknown>): void;
//# sourceMappingURL=security.d.ts.map