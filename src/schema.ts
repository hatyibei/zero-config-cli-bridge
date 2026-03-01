export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'gh_issue_list',
      description:
        'List GitHub issues for a repository using the local `gh` CLI. ' +
        'Requires gh to be installed and authenticated.',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description:
              'Repository in OWNER/REPO format (e.g. "cli/cli"). ' +
              'If omitted, uses the current directory\'s git remote.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of issues to fetch (default: 30).',
          },
          state: {
            type: 'string',
            description: 'Filter by state: "open" (default), "closed", or "all".',
          },
          label: {
            type: 'string',
            description: 'Filter by label name.',
          },
          assignee: {
            type: 'string',
            description: 'Filter by assignee login.',
          },
        },
      },
    },
    {
      name: 'gh_pr_list',
      description:
        'List GitHub pull requests for a repository using the local `gh` CLI. ' +
        'Requires gh to be installed and authenticated.',
      inputSchema: {
        type: 'object',
        properties: {
          repo: {
            type: 'string',
            description:
              'Repository in OWNER/REPO format (e.g. "cli/cli"). ' +
              'If omitted, uses the current directory\'s git remote.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of PRs to fetch (default: 30).',
          },
          state: {
            type: 'string',
            description: 'Filter by state: "open" (default), "closed", or "merged".',
          },
          base: {
            type: 'string',
            description: 'Filter by base branch name.',
          },
          assignee: {
            type: 'string',
            description: 'Filter by assignee login.',
          },
        },
      },
    },
  ];
}

export function buildGhCommand(
  toolName: string,
  args: Record<string, unknown>
): string {
  const parts: string[] = ['gh'];

  if (toolName === 'gh_issue_list') {
    parts.push('issue', 'list');
  } else if (toolName === 'gh_pr_list') {
    parts.push('pr', 'list');
  } else {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  if (args['repo'] !== undefined) {
    parts.push('--repo', String(args['repo']));
  }
  if (args['limit'] !== undefined) {
    parts.push('--limit', String(args['limit']));
  }
  if (args['state'] !== undefined) {
    parts.push('--state', String(args['state']));
  }
  if (toolName === 'gh_issue_list' && args['label'] !== undefined) {
    parts.push('--label', String(args['label']));
  }
  if (args['assignee'] !== undefined) {
    parts.push('--assignee', String(args['assignee']));
  }
  if (toolName === 'gh_pr_list' && args['base'] !== undefined) {
    parts.push('--base', String(args['base']));
  }

  return parts.join(' ');
}
