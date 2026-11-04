# Set up super-personal-Agent

Use the operator's existing answers and preferences. Choose an absolute state directory distinct from the original Superagent's directory. Keep the existing DSH profile and its other plugin settings intact.

1. Check Node, pnpm and the installed DSH against `package.json`. Build this checkout with `pnpm install --frozen-lockfile` and `pnpm check`.
2. Add `link:<absolute checkout path>` to the chosen DSH profile with `dsh plugin --profile <profile> add`. Add the `dsh-super-personal-agent` stateDir entry from [examples/profile.cordis.patch.yml](examples/profile.cordis.patch.yml); merge it into the existing patch, never replace the profile. A working model provider is required to execute tasks.
3. Open **super-personal-Agent → Settings → Sources**. Configure the local inbox root and a conversation, then enable it. Leave GitHub and Feishu disabled unless requested. No GitHub login, Git installation or repository is needed for an ordinary-directory task.
4. Under Policy, allow the operator's local sender ID (for example `owner`). Keep proactive rules off or in observation mode until wanted. Explicitly addressed requests from allowed senders can run independently of proactive rules.
5. Leave the Execution prepare command empty for research, plans and documents. For code work, configure an explicit checkout command and any required identity. Git hosting credentials are optional and source-specific.
6. Follow the JSON message example and acceptance checks in [009 Personal Agent](docs/009-personal-agent.md). Show where the task, main Session and outbox result can be opened.

Do not ask for secrets in chat. Configure GitHub accounts and the retained Feishu adapter only if the operator requests them; [006 Deployment](docs/006-deployment.md) describes their wrappers.

For a shared Host, enable, disable and restart this plugin through DSH's plugin management. The `scripts/dsh-super-personal-agent` helper controls an entire profile's Host and requires `--dedicated-host` for lifecycle commands. Do not use it to stop just this plugin in a shared profile. Do not create a recovery schedule unless requested.
