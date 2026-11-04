# 006 Deployment

The domain and execution model are described in [001 Domain](001-domain.md) and [003 Execution](003-execution.md). This fork can run in an existing DSH profile alongside the original Superagent, provided they have different state directories.

## Prerequisites

Use Node and DSH versions compatible with `package.json`, pnpm, and a configured DSH model provider. Ordinary-directory tasks do not need Git, GitHub or Feishu. Building a cloned checkout needs the normal development tools; that is separate from runtime readiness.

GitHub tasks additionally need git 2.32+, a GitHub CLI supporting the documented API operations and a dedicated account with push access to the selected repository. The retained GitHub adapter watches one github.com repository; it does not implement multi-repository monitoring or GitHub Enterprise Server. Ordinary git repositories can be prepared independently of that adapter. Configure SSH or other task-specific access explicitly; the plugin does not borrow ambient GitHub tokens or the operator's global Git identity.

## Install alongside the original plugin

From this fork's checkout:

```sh
pnpm install --frozen-lockfile
pnpm check
dsh plugin --profile <existing-profile> add "link:$PWD"
```

Merge the following row into that profile's `cordis.patch.yml`, using an absolute path:

```yaml
- id: dsh-super-personal-agent
  config:
    stateDir: /home/me/.dsh/state/super-personal-agent
```

Do not replace the existing profile patch, remove the original plugin, or reuse its state directory. The bundle supplies the main plugin, GitHub and inbox adapters and two presets. The Feishu adapter is present but disabled at the bundle level. GitHub, inbox and Feishu Source settings default to disabled.

For a new dedicated profile only, `dsh super-personal-agent --from-default-profile web --dump-config` creates a Web profile before installation. Do not run that creation command against an existing profile; it replaces profile configuration. Use the DSH version already selected for the installation instead of changing the Host globally as part of installing this fork.

## Configuration

| Setting | Meaning |
| --- | --- |
| `stateDir` | Required absolute directory for the database, lock, shims, Git configuration and default task directories. Must differ from the original plugin's directory. |
| `promptMaxChars` | Maximum saved prompt size; live setting. |
| `admissionContextMaxPages` | Maximum thread-context pages per assessment; live setting. |
| `admissionContextTimeoutMs` | Context-read timeout per assessment; live setting. |

Source settings, allowed senders, routing rules, model selection and execution settings live in the plugin's panel and database. The prepare command is empty by default: a new Ticket receives a plain directory under `<stateDir>/work`. A coding task may use a configured prepare command to create a checkout or worktree. Only directories with a `.git` entry receive the Git credential-configuration check; a non-Git directory never invokes Git for readiness.

## Source accounts

Startup creates local runtime state and the main Session without resolving any disabled Source account. An enabled GitHub or Feishu account failure is displayed on that Source; it does not prevent unrelated local tasks. Failures to write the plugin's own state or environment files still stop runtime setup.

### GitHub (optional)

Give the agent a dedicated CLI wrapper and sign it in outside chat:

```sh
mkdir -p ~/.local/bin
cat > ~/.local/bin/gh-personal-agent <<'EOF'
#!/bin/sh
GH_CONFIG_DIR="$HOME/.config/gh-personal-agent" exec gh "$@"
EOF
chmod +x ~/.local/bin/gh-personal-agent
gh-personal-agent auth login
gh-personal-agent api user --jq .login
```

Set the GitHub Source's repository and wrapper path, then enable it in the panel. The check verifies the account and push access. PR binding, repository inspection and PR lifecycle tracking are available only with a verified GitHub deployment. A non-GitHub task reports ready without `pr_number`. Do not invent a PR number to satisfy the report tool.

### Feishu (retained adapter, optional)

Enable `dsh-super-personal-agent-feishu` in the profile patch, then configure and enable its Source in the panel. This is the upstream CLI adapter, not the new general IM Connector planned for a later phase. Use a separate `lark-cli` config with strict mode `bot` and a wrapper setting `LARKSUITE_CLI_CONFIG_DIR`. Enter app secrets in the terminal, never in messages. Configure the bot's chats and allowed senders before enabling reception.

## Execution environment and coexistence

The fork never mutates `process.env`. Account probes and Source commands receive explicit environment overrides. The main and worker presets isolate `subprocess`; their provider applies this plugin's PATH and Git settings to shell commands. Spawned subagents retain the same worker preset. Interactive terminal allocation is not supported in these presets.

Each state directory owns `spa-worker-bin` and `spa-worker-gitconfig`. Shims reject unavailable `gh` and `lark-cli` operations explicitly. Known original-plugin shim directories are removed from the inherited worker PATH, without changing those files. This fork refuses to overwrite files bearing the original plugin's marker. GitHub URL rewriting and credential helpers are emitted only when a GitHub account is configured.

Presets retain the upstream `danger-full-access` permissions. Account wrappers select defaults; they are not filesystem or OS isolation. Existing applicable workspace instructions and explicit user authorization still govern publication and other external actions.

## Start and stop

Use DSH plugin management in a shared Host. Disabling this plugin cancels its own managed Sessions and releases its state lock. It does not stop the Host or original plugin.

For a dedicated profile only:

```sh
scripts/dsh-super-personal-agent --dedicated-host start
scripts/dsh-super-personal-agent status
scripts/dsh-super-personal-agent --dedicated-host stop
```

The helper defaults to profile `super-personal-agent`. It uses tmux and Python and operates on the whole DSH process for that profile. `start`, `stop` and `restart` refuse to run without the explicit dedicated-Host flag. `status` is read-only; `--profile` and `--url` select a different profile and port.

## Upgrade and troubleshooting

This fork is a separate installation, not an in-place upgrade of `dsh-superagent`. Back up its state before updating. Run `pnpm check` after updating, then reload only this plugin through DSH. No data migration from the original plugin is performed. Existing prompt overrides remain overrides; compare them with the new built-in defaults before expecting generic-task behavior.

| Symptom | Action |
| --- | --- |
| No local task starts | Enable the inbox, configure its absolute root and conversation, allow the sender, and address the message to the configured agent name. Check pause and evaluation state. |
| GitHub or Feishu Source reports an account error | Correct or disable that Source in the panel; use Check again after fixing a CLI outside the plugin. Local tasks remain available. |
| Foreign file in the shim directory | Choose a separate state directory; do not point this fork at the original plugin's state. |
| No result file | Check the worker report, main Session and delivery receipt; Source delivery must remain enabled and the conversation must still be allowed. |
| Prepare command failed | Read its captured output. A partial directory is retained for inspection; retry only after resolving the failure. |
| Shared Host lifecycle command refused | Use DSH plugin management; the dedicated-Host helper cannot stop a single plugin. |
