/**
 * Security layer.
 *
 * With direct spawn(bin, args[]) there is no shell to inject into.
 * This layer provides defence-in-depth:
 *   1. Whitelists the exact subcommand paths allowed to execute.
 *   2. Associates each subcommand with an operation tier.
 *   3. Validates individual argument values for anomalous content.
 *
 * Tiers:
 *   0  READ          — executes immediately, no approval
 *   2  WRITE         — blocks until human approves via TTY
 *   3  IRREVERSIBLE  — never executes; not exposed as tools
 */
export type OperationTier = 0 | 2 | 3;
export declare function getOperationTier(subcommand: string): OperationTier;
export declare function validateArgs(args: Record<string, unknown>): void;
//# sourceMappingURL=security.d.ts.map