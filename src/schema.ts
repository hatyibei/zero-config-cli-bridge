import type { OperationTier } from './security.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  subcommand: string[];
  tier: OperationTier;
  /** For read (Tier 0) tools: --json fields to request */
  jsonFields?: string[];
}

// Fields verified against `gh issue list --json` and `gh pr list --json`.
// Excludes: `id` (requires read:project scope), `body` (unbounded text).
const READ_FIELDS: Record<string, string[]> = {
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

// Fields returned by write commands (small, bounded — single created resource)
const WRITE_RESPONSE_FIELDS: Record<string, string[]> = {
  'issue create':  ['number', 'url', 'title', 'state'],
  'pr create':     ['number', 'url', 'title', 'state', 'baseRefName', 'headRefName'],
  'issue comment': ['url', 'body'],
};

export function buildToolDefinitions(): ToolDefinition[] {
  return [
    // ── Tier 0: Read ────────────────────────────────────────────────────────
    {
      name: 'gh_issue_list',
      description:
        'List GitHub issues as structured JSON. ' +
        'Read-only — executes immediately without approval.',
      subcommand: ['issue', 'list'],
      tier: 0,
      jsonFields: READ_FIELDS['issue list'],
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
        'Read-only — executes immediately without approval.',
      subcommand: ['pr', 'list'],
      tier: 0,
      jsonFields: READ_FIELDS['pr list'],
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

    // ── Tier 2: Write (requires human TTY approval) ──────────────────────────
    {
      name: 'gh_issue_create',
      description:
        'Create a GitHub issue. ' +
        '⚠️  WRITE OPERATION — blocks until a human approves at the terminal. ' +
        'Uses local `gh` authentication. Requires title.',
      subcommand: ['issue', 'create'],
      tier: 2,
      jsonFields: WRITE_RESPONSE_FIELDS['issue create'],
      inputSchema: {
        type: 'object',
        properties: {
          title:    { type: 'string', description: 'Issue title (required).' },
          body:     { type: 'string', description: 'Issue body text.' },
          repo:     { type: 'string', description: 'OWNER/REPO. Omit to use current directory.' },
          label:    { type: 'string', description: 'Label name to apply.' },
          assignee: { type: 'string', description: 'Assignee login.' },
        },
        required: ['title'],
      },
    },
    {
      name: 'gh_pr_create',
      description:
        'Create a GitHub pull request. ' +
        '⚠️  WRITE OPERATION — blocks until a human approves at the terminal. ' +
        'Uses local `gh` authentication. Requires title.',
      subcommand: ['pr', 'create'],
      tier: 2,
      jsonFields: WRITE_RESPONSE_FIELDS['pr create'],
      inputSchema: {
        type: 'object',
        properties: {
          title:  { type: 'string', description: 'PR title (required).' },
          body:   { type: 'string', description: 'PR body text.' },
          base:   { type: 'string', description: 'Base branch (default: repo default branch).' },
          head:   { type: 'string', description: 'Head branch (default: current branch).' },
          repo:   { type: 'string', description: 'OWNER/REPO. Omit to use current directory.' },
          draft:  { type: 'boolean', description: 'Open as draft PR.' },
        },
        required: ['title'],
      },
    },
    {
      name: 'gh_issue_comment',
      description:
        'Add a comment to a GitHub issue. ' +
        '⚠️  WRITE OPERATION — blocks until a human approves at the terminal. ' +
        'Uses local `gh` authentication. Requires issue number and body.',
      subcommand: ['issue', 'comment'],
      tier: 2,
      jsonFields: WRITE_RESPONSE_FIELDS['issue comment'],
      inputSchema: {
        type: 'object',
        properties: {
          issue:  { type: 'number', description: 'Issue number (required).' },
          body:   { type: 'string', description: 'Comment text (required).' },
          repo:   { type: 'string', description: 'OWNER/REPO. Omit to use current directory.' },
        },
        required: ['issue', 'body'],
      },
    },
  ];
}

/**
 * Builds the gh args array using --flag=value notation throughout.
 * Prevents option injection: a value starting with '-' cannot be
 * misinterpreted as a separate flag by gh's argument parser.
 */
export function buildGhArgs(tool: ToolDefinition, args: Record<string, unknown>): string[] {
  const parts: string[] = [...tool.subcommand];

  // All tools request JSON output for structured responses
  if (tool.jsonFields && tool.jsonFields.length > 0) {
    parts.push(`--json=${tool.jsonFields.join(',')}`);
  }

  switch (tool.name) {
    case 'gh_issue_list':
      if (args['repo'])     parts.push(`--repo=${String(args['repo'])}`);
      if (args['limit'])    parts.push(`--limit=${String(args['limit'])}`);
      if (args['state'])    parts.push(`--state=${String(args['state'])}`);
      if (args['label'])    parts.push(`--label=${String(args['label'])}`);
      if (args['assignee']) parts.push(`--assignee=${String(args['assignee'])}`);
      break;

    case 'gh_pr_list':
      if (args['repo'])     parts.push(`--repo=${String(args['repo'])}`);
      if (args['limit'])    parts.push(`--limit=${String(args['limit'])}`);
      if (args['state'])    parts.push(`--state=${String(args['state'])}`);
      if (args['base'])     parts.push(`--base=${String(args['base'])}`);
      if (args['assignee']) parts.push(`--assignee=${String(args['assignee'])}`);
      break;

    case 'gh_issue_create':
      parts.push(`--title=${String(args['title'])}`);
      if (args['body'])     parts.push(`--body=${String(args['body'])}`);
      if (args['repo'])     parts.push(`--repo=${String(args['repo'])}`);
      if (args['label'])    parts.push(`--label=${String(args['label'])}`);
      if (args['assignee']) parts.push(`--assignee=${String(args['assignee'])}`);
      break;

    case 'gh_pr_create':
      parts.push(`--title=${String(args['title'])}`);
      if (args['body'])  parts.push(`--body=${String(args['body'])}`);
      if (args['base'])  parts.push(`--base=${String(args['base'])}`);
      if (args['head'])  parts.push(`--head=${String(args['head'])}`);
      if (args['repo'])  parts.push(`--repo=${String(args['repo'])}`);
      if (args['draft']) parts.push('--draft');
      break;

    case 'gh_issue_comment':
      parts.push(String(args['issue']));
      parts.push(`--body=${String(args['body'])}`);
      if (args['repo']) parts.push(`--repo=${String(args['repo'])}`);
      break;
  }

  return parts;
}

/** Human-readable preview of the command an agent intends to execute */
export function buildCommandPreview(tool: ToolDefinition, args: Record<string, unknown>): string {
  return 'gh ' + buildGhArgs(tool, args).join(' ');
}
