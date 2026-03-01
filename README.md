# zero-config-cli-bridge

**Zero Setup. Zero API Keys. Just your local CLI.**

> Still copy-pasting `GITHUB_TOKEN` into `.env` files?
> Still wondering why your AI agent can't see your private repos?
> Stop. Your machine already has everything it needs.

`zero-config-cli-bridge` is an MCP (Model Context Protocol) server that exposes your **already-authenticated local CLI tools** directly to LLM agents — no API keys, no OAuth flows, no configuration.

If `gh issue list` works in your terminal, it works in Claude Desktop. That's it.

---

## Install

```bash
# Option A: npx (no install required)
npx -y zero-config-cli-bridge

# Option B: global install
npm install -g zero-config-cli-bridge
```

**Prerequisites:** `gh` CLI installed and authenticated (`gh auth login`)

---

## Claude Desktop Setup

Add to `~/AppData/Roaming/Claude/claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "zero-config-cli-bridge": {
      "command": "npx",
      "args": ["-y", "zero-config-cli-bridge"]
    }
  }
}
```

Restart Claude Desktop. Done.

---

## What you can do

Ask Claude naturally:

- *"List the open issues in cli/cli"*
- *"Show me the last 20 PRs merged into main"*
- *"Which issues are labeled bug and unassigned?"*

Claude will call the MCP tools, hit your local `gh` binary with your existing authentication, and return real data — without ever seeing your token.

---

## Available Tools

| Tool | Command | Description |
|------|---------|-------------|
| `gh_issue_list` | `gh issue list` | List issues with filters |
| `gh_pr_list` | `gh pr list` | List pull requests with filters |

### Arguments

**gh_issue_list**
| Argument | Type | Description |
|----------|------|-------------|
| `repo` | string | `OWNER/REPO` format. Omit to use current directory's remote. |
| `limit` | number | Max results (default: 30) |
| `state` | string | `open` / `closed` / `all` |
| `label` | string | Filter by label |
| `assignee` | string | Filter by assignee login |

**gh_pr_list**
| Argument | Type | Description |
|----------|------|-------------|
| `repo` | string | `OWNER/REPO` format |
| `limit` | number | Max results (default: 30) |
| `state` | string | `open` / `closed` / `merged` |
| `base` | string | Filter by base branch |
| `assignee` | string | Filter by assignee login |

---

## Security: Layered Defense

This server is **read-only by design**. Destructive operations are blocked at multiple layers:

```
Request
  │
  ▼
┌─────────────────────────────────────────────┐
│ Layer 1: LLM Self-Governance                │
│ The tool schema explicitly describes        │
│ read-only intent. Claude refuses mutating   │
│ requests before calling the tool at all.    │
└─────────────────┬───────────────────────────┘
                  │ (if bypassed)
                  ▼
┌─────────────────────────────────────────────┐
│ Layer 2: Keyword Validator (security.ts)    │
│ Blocks: create, delete, edit, rm,           │
│ update, close, reopen, merge                │
│ Returns: "Mutating commands are blocked"    │
└─────────────────┬───────────────────────────┘
                  │ (if bypassed)
                  ▼
┌─────────────────────────────────────────────┐
│ Layer 3: gh CLI Error                       │
│ Invalid commands fail at the gh binary      │
│ level with a non-zero exit code.            │
└─────────────────────────────────────────────┘
```

**Verified in production:** TEST 3 on Claude Desktop confirmed Layer 1 blocked a `delete` injection attempt before the tool was even invoked.

### Additional Safeguards

- **Timeout:** Processes are killed with `SIGKILL` after 3000ms — no hanging on interactive prompts
- **Output truncation:** stdout/stderr capped at 2000 characters to prevent context exhaustion. Long outputs append `...[Output truncated. Use grep/jq to filter]`
- **CI mode:** `CI=true` is injected to suppress interactive prompts

---

## How It Works

```
Claude Desktop
     │  MCP (stdio JSON-RPC)
     ▼
zero-config-cli-bridge
     │  child_process.spawn
     ▼
gh CLI (your local binary)
     │  uses ~/.config/gh/hosts.yml
     ▼
GitHub API
```

Your token never leaves your machine. The bridge just connects Claude to a process that was already authorized.

---

## Roadmap

- [ ] `gh issue view` / `gh pr view`
- [ ] `gh run list` / `gh release list`
- [ ] Dynamic schema generation from `gh --help`
- [ ] Support for `git`, `docker`, `kubectl`
- [ ] Configurable allow-list for additional read-only commands

PRs welcome.

---

## License

MIT
