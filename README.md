# dsh-super-personal-agent

**License: [MIT](LICENSE).**

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
- [Native messaging and publication rules](docs/native-messaging.md): ordered text, image and file results with immutable snapshots and per-part delivery receipts
- [Worker models and ModLens](docs/model-routing.md): required image adapter, provider capabilities and stable Session model selection
- [008 Cookbook](docs/008-cookbook.md): adding a Source
- [009 Personal Agent](docs/009-personal-agent.md): first local task, metadata and coexistence

## Development

`pnpm check` runs the typecheck, the tests and the build.

## License

This project is open source under the [MIT License](LICENSE). The fork's contributions are distributed under MIT, and the original upstream copyright and license notices are retained. Reused third-party code and assets remain subject to their applicable licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md).

## Acknowledgements

This project builds on and reuses code from these open-source projects:

- **[DeepSeek Superagent prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)**, by the DeepSeek Harness Team: the base implementation and task orchestration architecture of this fork, including Sources, Triggers, Threads, Tickets and Workers.
- **[dsh-im](https://github.com/xmanrui/dsh-im)**, by xmanrui and contributors: selected Feishu/Lark connector, shared messaging and management UI modules, copied and adapted into this plugin. The source revision and local adaptations are recorded in [the upstream manifest](vendor/dsh-im/UPSTREAM.json); its [MIT license](vendor/dsh-im/LICENSE) and [upstream third-party notices](vendor/dsh-im/THIRD_PARTY_NOTICES.md) are preserved.

Thank you to the maintainers and contributors of both projects for sharing their engineering work, architecture and implementations. Their work makes this Personal Agent fork possible. We also thank [JHOpenDev/dsh-superagent-inbox](https://github.com/JHOpenDev/dsh-superagent-inbox) for the local inbox adapter this project adapts.
