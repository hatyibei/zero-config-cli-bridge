import { executeCommand } from './executor.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  /** gh subcommand tokens, e.g. ['issue', 'list'] */
  subcommand: string[];
  /** JSON fields confirmed available in the local gh binary */
  jsonFields: string[];
}

const FALLBACK_FIELDS: Record<string, string[]> = {
  'issue list': ['number', 'title', 'state', 'labels', 'assignees', 'createdAt', 'url'],
  'pr list':    ['number', 'title', 'state', 'labels', 'assignees', 'createdAt', 'url', 'baseRefName'],
};

/**
 * Fields known to work with the standard `repo` OAuth scope.
 * Excludes:
 *   - Fields requiring elevated scopes (e.g. `id` requires read:project)
 *   - `body` — issue/PR body text is unbounded and causes JSON truncation
 */
const REPO_SCOPE_SAFE_FIELDS: ReadonlySet<string> = new Set([
  'number', 'title', 'state', 'labels', 'assignees',
  'author', 'createdAt', 'updatedAt', 'closedAt', 'url',
  'comments', 'milestone', 'isDraft', 'locked',
  // PR-specific
  'baseRefName', 'headRefName', 'headRepository', 'mergedAt', 'mergeCommit',
  'reviewDecision', 'additions', 'deletions', 'changedFiles',
]);

/**
 * Queries the local gh binary for the JSON fields it supports for a given
 * subcommand. Uses an intentionally invalid field name to trigger gh's
 * "available fields" error message, then parses the response.
 *
 * Falls back to a known-safe static list if detection fails.
 */
async function probeJsonFields(subcommand: string[]): Promise<string[]> {
  const key = subcommand.join(' ');
  try {
    const result = await executeCommand('gh', [
      ...subcommand,
      '--json', '__probe__',
      '--limit', '0',
    ]);
    const text = result.stderr;
    // gh outputs: `run 'gh issue list --json' to see available fields`
    // then lists them, or lists inline after a colon.
    const match = text.match(/available fields?[:\s]+([\s\S]+?)(?:\n\n|$)/i);
    if (match) {
      const fields = match[1]
        .trim()
        .split(/[\s,]+/)
        .map((f) => f.trim())
        .filter((f) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(f))
        .filter((f) => REPO_SCOPE_SAFE_FIELDS.has(f));  // exclude elevated-scope fields
      if (fields.length > 0) return fields;
    }
  } catch {
    // gh not found or timed out — fall through to static
  }
  return FALLBACK_FIELDS[key] ?? [];
}

export async function buildToolDefinitions(): Promise<ToolDefinition[]> {
  const [issueFields, prFields] = await Promise.all([
    probeJsonFields(['issue', 'list']),
    probeJsonFields(['pr', 'list']),
  ]);

  return [
    {
      name: 'gh_issue_list',
      description:
        'List GitHub issues as structured JSON. ' +
        'Uses the local `gh` CLI and its existing authentication — no API key required.',
      subcommand: ['issue', 'list'],
      jsonFields: issueFields,
      inputSchema: {
        type: 'object',
        properties: {
          repo:     { type: 'string', description: 'OWNER/REPO (e.g. "cli/cli"). Omit to use current directory.' },
          limit:    { type: 'number', description: 'Max results (default: 30).' },
          state:    { type: 'string', description: '"open" (default) | "closed" | "all".' },
          label:    { type: 'string', description: 'Filter by label name.' },
          assignee: { type: 'string', description: 'Filter by assignee login.' },
        },
      },
    },
    {
      name: 'gh_pr_list',
      description:
        'List GitHub pull requests as structured JSON. ' +
        'Uses the local `gh` CLI and its existing authentication — no API key required.',
      subcommand: ['pr', 'list'],
      jsonFields: prFields,
      inputSchema: {
        type: 'object',
        properties: {
          repo:     { type: 'string', description: 'OWNER/REPO (e.g. "cli/cli"). Omit to use current directory.' },
          limit:    { type: 'number', description: 'Max results (default: 30).' },
          state:    { type: 'string', description: '"open" (default) | "closed" | "merged".' },
          base:     { type: 'string', description: 'Filter by base branch.' },
          assignee: { type: 'string', description: 'Filter by assignee login.' },
        },
      },
    },
  ];
}

/** Builds the gh args array for direct spawn — no shell string, no injection surface. */
export function buildGhArgs(tool: ToolDefinition, args: Record<string, unknown>): string[] {
  const parts: string[] = [...tool.subcommand, '--json', tool.jsonFields.join(',')];

  if (args['repo']     !== undefined) parts.push('--repo',     String(args['repo']));
  if (args['limit']    !== undefined) parts.push('--limit',    String(args['limit']));
  if (args['state']    !== undefined) parts.push('--state',    String(args['state']));
  if (args['label']    !== undefined && tool.name === 'gh_issue_list') parts.push('--label',    String(args['label']));
  if (args['assignee'] !== undefined) parts.push('--assignee', String(args['assignee']));
  if (args['base']     !== undefined && tool.name === 'gh_pr_list')    parts.push('--base',     String(args['base']));

  return parts;
}
