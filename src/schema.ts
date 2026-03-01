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
  /** JSON fields confirmed available in the local gh binary, filtered to repo-scope-safe set */
  jsonFields: string[];
}

/**
 * Fields requiring only the standard `repo` OAuth scope.
 * Explicitly excludes:
 *   - `id`    — requires read:project scope
 *   - `body`  — unbounded text; breaks JSON item-level truncation
 */
const REPO_SCOPE_SAFE_FIELDS: ReadonlySet<string> = new Set([
  'number', 'title', 'state', 'labels', 'assignees',
  'author', 'createdAt', 'updatedAt', 'closedAt', 'url',
  'comments', 'milestone', 'isDraft', 'locked',
  // PR-specific
  'baseRefName', 'headRefName', 'headRepository', 'mergedAt', 'mergeCommit',
  'reviewDecision', 'additions', 'deletions', 'changedFiles',
]);

const FALLBACK_FIELDS: Record<string, string[]> = {
  'issue list': ['number', 'title', 'state', 'labels', 'assignees', 'createdAt', 'url'],
  'pr list':    ['number', 'title', 'state', 'labels', 'assignees', 'createdAt', 'url', 'baseRefName'],
};

/**
 * Detects JSON fields available in the local gh binary by calling
 * `gh <subcommand> --json` with no field argument. Recent gh versions
 * output the available field list to stderr in this case — no error
 * injection needed. Falls back to the static list on any failure.
 */
async function detectJsonFields(subcommand: string[]): Promise<string[]> {
  const key = subcommand.join(' ');
  try {
    // `gh issue list --json` with no fields causes gh to list available fields on stderr.
    // This is documented behaviour, not error scraping.
    const result = await executeCommand('gh', [...subcommand, '--json']);
    const text = result.stderr + result.stdout;
    // Output format: "Use `--json` with one or more of: field1,field2,..."
    // or a newline-separated list after "Available fields:"
    const commaMatch = text.match(/--json`?\s+with[^:]*:\s*([a-zA-Z,\s]+)/i);
    if (commaMatch) {
      const fields = commaMatch[1]
        .split(/[,\s]+/)
        .map((f) => f.trim())
        .filter((f) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(f))
        .filter((f) => REPO_SCOPE_SAFE_FIELDS.has(f));
      if (fields.length > 0) return fields;
    }
  } catch {
    // gh not installed or timed out
  }
  return FALLBACK_FIELDS[key] ?? [];
}

export async function buildToolDefinitions(): Promise<ToolDefinition[]> {
  const [issueFields, prFields] = await Promise.all([
    detectJsonFields(['issue', 'list']),
    detectJsonFields(['pr', 'list']),
  ]);

  return [
    {
      name: 'gh_issue_list',
      description:
        'List GitHub issues as structured JSON. ' +
        'Uses the local `gh` CLI and its existing authentication — no API key required. ' +
        'Read-only. Does not create, edit, or delete issues.',
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
        'Uses the local `gh` CLI and its existing authentication — no API key required. ' +
        'Read-only. Does not create, edit, merge, or close pull requests.',
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

/**
 * Builds the gh args array using --flag=value notation throughout.
 * This prevents option injection: a value starting with '-' cannot
 * be misinterpreted as a separate flag by gh's argument parser.
 */
export function buildGhArgs(tool: ToolDefinition, args: Record<string, unknown>): string[] {
  const parts: string[] = [...tool.subcommand, `--json=${tool.jsonFields.join(',')}`];

  if (args['repo']     !== undefined) parts.push(`--repo=${String(args['repo'])}`);
  if (args['limit']    !== undefined) parts.push(`--limit=${String(args['limit'])}`);
  if (args['state']    !== undefined) parts.push(`--state=${String(args['state'])}`);
  if (args['label']    !== undefined && tool.name === 'gh_issue_list') parts.push(`--label=${String(args['label'])}`);
  if (args['assignee'] !== undefined) parts.push(`--assignee=${String(args['assignee'])}`);
  if (args['base']     !== undefined && tool.name === 'gh_pr_list')    parts.push(`--base=${String(args['base'])}`);

  return parts;
}
