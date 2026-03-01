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
const SUBCOMMAND_TIERS = new Map([
    ['issue list', 0],
    ['pr list', 0],
    ['issue create', 2],
    ['pr create', 2],
    ['issue comment', 2],
]);
export function getOperationTier(subcommand) {
    const tier = SUBCOMMAND_TIERS.get(subcommand);
    if (tier === undefined) {
        throw new Error(`Error: Subcommand "${subcommand}" is not in the allow-list.`);
    }
    return tier;
}
export function validateArgs(args) {
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
//# sourceMappingURL=security.js.map