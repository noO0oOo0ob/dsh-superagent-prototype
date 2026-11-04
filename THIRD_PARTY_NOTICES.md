# Third-party notices and acknowledgements

super-personal-Agent is released under the [MIT License](LICENSE). This file records the principal upstream projects whose code is reused. Original copyright notices and license terms are retained; this notice does not replace the licenses of third-party code, dependencies or assets.

## DeepSeek Superagent prototype

- Project: [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype).
- Copyright: Copyright (c) 2026 DeepSeek Harness Team.
- License: MIT; the original copyright notice and permission text are retained in the root [LICENSE](LICENSE).
- Reuse: this repository is a fork of the Superagent prototype and adapts its task orchestration, execution and management implementation for personal-agent use.

## dsh-im

- Project: [xmanrui/dsh-im](https://github.com/xmanrui/dsh-im).
- Copyright: Copyright (c) 2026 xmanrui.
- License: [MIT](vendor/dsh-im/LICENSE).
- Imported revision: v5.10.0, commit `c826bfa415d79669d8ebba206cf4a1eac554d8e2`.
- Reuse: selected Feishu/Lark connector, shared messaging and management UI modules are copied and adapted under `vendor/dsh-im/`. These modules are integrated into this plugin; an installed dsh-im plugin is not required.

The exact copied files, original checksums and local adaptations are recorded in [UPSTREAM.json](vendor/dsh-im/UPSTREAM.json). The original [dsh-im third-party notices](vendor/dsh-im/THIRD_PARTY_NOTICES.md) are retained as supplied; they also describe upstream features beyond the modules included in this fork. The listed third-party licenses continue to apply to their respective reused code and assets.

## Thanks

We thank the DeepSeek Harness Team, xmanrui, and the maintainers and contributors of both projects for making their implementations available as open source. This project builds on their engineering work and credits their contributions.
