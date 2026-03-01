/**
 * Schema definitions for exposed gh tools.
 *
 * Field list design:
 *   STATIC_FIELDS is the authoritative source of truth.
 *   It contains only fields that work with the standard `repo` OAuth scope
 *   and have been stable across gh major versions.
 *
 *   The probe (detectJsonFields) is NOT called at startup.
 *   Rationale: the probe has no reliability guarantee — gh's output format
 *   is human-readable and can change with any release. Running an unreliable
 *   subprocess at every server start adds latency and timeout risk for zero
 *   guaranteed gain. Static fields are the correct default.
 */
// Fields verified against `gh issue list --json` and `gh pr list --json` output.
// Excludes: `id` (requires read:project scope), `body` (unbounded text).
const STATIC_FIELDS = {
    'issue list': [
        'number', 'title', 'state', 'labels', 'assignees',
        'author', 'createdAt', 'updatedAt', 'closedAt', 'url',
        'comments', 'milestone',
    ],
    'pr list': [
        'number', 'title', 'state', 'labels', 'assignees',
        'author', 'createdAt', 'updatedAt', 'closedAt', 'url',
        'baseRefName', 'headRefName', 'isDraft', 'mergedAt', 'reviewDecision',
    ],
};
export function buildToolDefinitions() {
    return [
        {
            name: 'gh_issue_list',
            description: 'List GitHub issues as structured JSON. ' +
                'Uses the local `gh` CLI and its existing authentication — no API key required. ' +
                'Read-only. Does not create, edit, or delete issues.',
            subcommand: ['issue', 'list'],
            jsonFields: STATIC_FIELDS['issue list'],
            inputSchema: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'OWNER/REPO (e.g. "cli/cli"). Omit to use current directory.' },
                    limit: { type: 'number', description: 'Max results (default: 30).' },
                    state: { type: 'string', description: '"open" (default) | "closed" | "all".' },
                    label: { type: 'string', description: 'Filter by label name.' },
                    assignee: { type: 'string', description: 'Filter by assignee login.' },
                },
            },
        },
        {
            name: 'gh_pr_list',
            description: 'List GitHub pull requests as structured JSON. ' +
                'Uses the local `gh` CLI and its existing authentication — no API key required. ' +
                'Read-only. Does not create, edit, merge, or close pull requests.',
            subcommand: ['pr', 'list'],
            jsonFields: STATIC_FIELDS['pr list'],
            inputSchema: {
                type: 'object',
                properties: {
                    repo: { type: 'string', description: 'OWNER/REPO (e.g. "cli/cli"). Omit to use current directory.' },
                    limit: { type: 'number', description: 'Max results (default: 30).' },
                    state: { type: 'string', description: '"open" (default) | "closed" | "merged".' },
                    base: { type: 'string', description: 'Filter by base branch.' },
                    assignee: { type: 'string', description: 'Filter by assignee login.' },
                },
            },
        },
    ];
}
/**
 * Builds the gh args array using --flag=value notation throughout.
 * Prevents option injection: a value starting with '-' cannot be
 * misinterpreted as a separate flag by gh's argument parser.
 */
export function buildGhArgs(tool, args) {
    const parts = [...tool.subcommand, `--json=${tool.jsonFields.join(',')}`];
    if (args['repo'] !== undefined)
        parts.push(`--repo=${String(args['repo'])}`);
    if (args['limit'] !== undefined)
        parts.push(`--limit=${String(args['limit'])}`);
    if (args['state'] !== undefined)
        parts.push(`--state=${String(args['state'])}`);
    if (args['label'] !== undefined && tool.name === 'gh_issue_list')
        parts.push(`--label=${String(args['label'])}`);
    if (args['assignee'] !== undefined)
        parts.push(`--assignee=${String(args['assignee'])}`);
    if (args['base'] !== undefined && tool.name === 'gh_pr_list')
        parts.push(`--base=${String(args['base'])}`);
    return parts;
}
//# sourceMappingURL=schema.js.map