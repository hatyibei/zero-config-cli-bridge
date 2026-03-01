const BLOCKED_KEYWORDS = [
    'create',
    'delete',
    'edit',
    'rm',
    'update',
    'close',
    'reopen',
    'merge',
];
export function validateReadOnly(command) {
    const lower = command.toLowerCase();
    for (const keyword of BLOCKED_KEYWORDS) {
        // Match keyword as a whole word (surrounded by non-alphanumeric chars or at boundaries)
        const pattern = new RegExp(`(?<![a-z0-9])${keyword}(?![a-z0-9])`);
        if (pattern.test(lower)) {
            throw new Error('Error: Mutating commands are blocked in MVP version. Use read-only commands.');
        }
    }
}
//# sourceMappingURL=security.js.map