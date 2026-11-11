# Built-in experts

These five portable expert packages ship in the plugin archive. First plugin startup installs and enables missing IDs in one transaction. Restart and upgrade preserve existing packages, including user edits and disabled state. Existing Ticket snapshots never change. Source allowlists and fixed/default expert settings still apply; ordinary conversation and unmatched work can remain general.

| Package | Expert | Lazy Skills |
| --- | --- | --- |
| builtin-research | 研究分析专家 | source-check, option-comparison, research-brief |
| builtin-writing | 写作表达专家 | draft-copy, revise-tone, translate |
| builtin-software | 软件工程专家 | repository-map, diagnose-bug, implement-review |
| builtin-data | 数据分析专家 | data-quality, metric-analysis, charts-tables |
| builtin-planning | 规划执行专家 | task-plan, schedule-plan, travel-learning |

Each directory contains a portable plugin.json, personal-agent.yaml, AGENTS.md, SOUL.md and three Skills. Skill bodies are not preloaded. All experts can use the shared reply-presentation Skill and publish conversation content or files according to the request. The packages require no extra MCP servers, credentials or fixed model; actual execution uses the task's configured tools and model.

To adopt updated bundled text for an existing ID, preview and refresh its installed package directory in Expert packages, review changes, then enable it. This affects future Tickets only. The installer never automatically replaces user-owned snapshots or rewrites source files. Missing or invalid resources for an uninstalled ID fail startup visibly and roll back the batch. Routing examples guide model selection; parsing and offline tests do not establish semantic routing accuracy or live channel delivery.
