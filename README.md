# dsh-super-personal-agent

**super-personal-Agent** is a personal-task fork of [DeepSeek's Superagent prototype](https://github.com/deepseek-ai/dsh-superagent-prototype). It is a research prototype, not an official DeepSeek product. The local inbox adapter is adapted from [JHOpenDev/dsh-superagent-inbox](https://github.com/JHOpenDev/dsh-superagent-inbox).

A local message can become a durable Ticket, run in its own worker Session and ordinary directory, and deliver its result back through the main Session and the originating inbox. Research, plans, writing, brainstorming and local coding do not require a GitHub account, repository or PR. GitHub and the existing Feishu adapter remain optional Sources, disabled until configured and enabled.

The package ID is `dsh-super-personal-agent`. It uses its own service, presets, Sessions, panel, HTTP routes and worker environment so it can share a DSH profile with `dsh-superagent`. Give each plugin a separate state directory. Installing this fork does not migrate the original plugin's data.

## Setup

Start with [SETUP.md](SETUP.md), or follow the [phase-one local inbox walkthrough](docs/009-personal-agent.md). The walkthrough needs no external account. [Deployment](docs/006-deployment.md) covers installation alongside the original plugin and optional GitHub configuration.

Personal settings include native Feishu/Lark QR or manual account setup, Obsidian exports, repository resources, schedules, hooks and explicit cross-conversation routing. The installed dsh-im plugin is not required. The retained GitHub adapter still watches one repository; this does not limit local tasks or workspace preparation.

Automatic results and Main's reply tool share a persistent delivery receipt per result and destination. Rewording a reply or restarting the plugin does not resend a published result. Transferring an existing bot from dsh-im requires stopping its old listener first; independently installed plugins do not share an intake ledger. See [Connector ownership and handover](docs/014-connectors.md#consumer-mode-handover).

## Documentation

Read the numbered documents in order; each builds only on the ones before it.

- [000 Philosophy](docs/000-philosophy.md)
- [001 Domain model](docs/001-domain.md)
- [002 Authorization](docs/002-authorization.md)
- [003 Execution](docs/003-execution.md)
- [004 Prompts](docs/004-prompts.md)
- [005 Panel](docs/005-panel.md)
- [006 Deployment](docs/006-deployment.md): manual setup, configuration, upgrades and troubleshooting
- [007 Architecture](docs/007-architecture.md)
- [Personal runtime and Main Session](docs/010-personal-runtime.md)
- [Obsidian storage](docs/011-vault.md)
- [Repository resources](docs/012-repositories.md)
- [Schedules and hooks](docs/013-schedules-hooks.md)
- [Connectors](docs/014-connectors.md)
- [Personal setup and acceptance](docs/015-personal-setup.md)
- [008 Cookbook](docs/008-cookbook.md): adding a Source
- [009 Personal Agent](docs/009-personal-agent.md): first local task, metadata and coexistence

## Development

`pnpm check` runs the typecheck, the tests and the build.

## License

[MIT](LICENSE)

Native messaging migration and publication rules: [implementation notes](docs/native-messaging.md). Results support ordered text, image and file parts with immutable artifact snapshots and per-part delivery receipts.
