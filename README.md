# Glomo plugins

The Glomo plugin for [Claude Code](https://docs.claude.com/en/docs/claude-code). It connects your agent to the Glomo MCP server and adds the Glomo agent skills.

## Install

In Claude Code:

```text
/plugin marketplace add glomopay/glomo-ai-plugins
/plugin install glomo@glomo
```

To offer it to everyone who works in one of your repos, add this to the repo's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "glomo": { "source": { "source": "github", "repo": "glomopay/glomo-ai-plugins" } }
  },
  "enabledPlugins": { "glomo@glomo": true }
}
```

## What you get

- **The Glomo MCP server** (`https://mcp.glomo.one/mcp`). Docs search, API search and details, sample requests and the implementation planner work without a credential. `glomo_api_read` and `glomo_api_write` run calls against your sandbox account and need an MCP credential.
- **Agent skills:** `/glomo:integration`, `/glomo:payins`, `/glomo:payouts`, `/glomo:testing` and `/glomo:webhooks`. Claude Code loads each one when your task needs it, or you can run it by name.

## Sandbox API calls

Mint an MCP credential with your test secret key, and set it in the shell you start Claude Code from:

```bash
curl -X POST 'https://api.glomopay.com/api/v1/mcp-credentials' -H "Authorization: Bearer $GLOMO_API_KEY"
export GLOMO_MCP_CREDENTIAL="<mcp_credential from the response>"
```

The plugin sends it as `Authorization: Bearer <credential>`. It is optional: without it, everything except the two execution tools still works. See [Connect an AI agent with MCP](https://docs.glomo.one/platform/mcp-server) for rotation, limits and troubleshooting.

## Maintaining this repo

- **The skills are generated.** They are authored in the Glomo docs and published at `https://docs.glomo.one/.well-known/skills/`. Don't edit `plugins/glomo/skills/` by hand. The sync drops the catalogue's `glomo-` prefix, because Claude Code already namespaces plugin skills (`glomo-payouts` becomes `/glomo:payouts`), and rewrites references between skills to match. Run `node scripts/sync-skills.mjs` to refresh them; the `sync-skills` workflow also does this weekly and opens a PR when they change.
- **Validate** with `claude plugin validate --strict .` and `claude plugin validate --strict plugins/glomo`. CI runs both on every PR.
- **Release** by bumping `version` in `plugins/glomo/.claude-plugin/plugin.json`. Installed plugins pick up the new version when they update. The skills sync bumps the patch version itself when skills change.
