# Repository resources

A personal task can select zero, one or several resources. An empty selection requires no Git executable or account. Resource IDs are explicit task inputs; configuring a repository does not attach it to every task. Resource selection is independent of GitHub event monitoring.

## Configuration

The repository registry accepts these entries:

```json
[
  { "id": "website", "kind": "git", "path": "/absolute/path/to/website", "ref": "main" },
  { "id": "library", "kind": "git", "remote": "git@gitlab.com:me/library.git", "ref": "main" },
  { "id": "notes", "kind": "directory", "path": "/absolute/path/to/research-notes" }
]
```

A Git entry needs exactly one `path` or `remote`. Local paths must name a repository root or bare repository, rather than a subdirectory. A remote can use HTTPS, SSH, Git or a local `file:` URL; executable transports and embedded passwords are rejected. SSH usernames are allowed. Configure credentials in the executor's Git environment instead of putting secrets in these entries. `ref` defaults to `HEAD` and accepts a branch, tag or commit ID. The resource is pinned to the resolved commit on its first preparation.

A directory entry is copied into the task workspace. The source stays unchanged. Symlinks, special files and nested `.git` metadata are rejected because they would break isolation from the original files. Directory copies reflect the files present during preparation; they are not filesystem snapshots taken under a source lock.

## Task workspaces and recovery

Each task uses `<task-directory>/repositories/<resource-id>`. Git resources get a branch named `personal-agent/<task-hash>/<resource-id>` and an actual Git worktree. A local repository keeps its current branch, working files and staged changes; task commits and uncommitted changes stay in the task worktree. Preparation never pushes, resets or cleans a repository. Git worktree creation necessarily adds a branch and Git administrative records to the source repository.

Remote repositories use an owned bare cache under `<state-directory>/repository-cache/`. Fetch resolves the selected remote ref through `FETCH_HEAD` without pruning or resetting existing task branches. A new task can use an updated upstream revision while an earlier task retains its pinned revision. Git and other hosting platforms use the same preparation path; GitHub CLI is unnecessary.

The task retains its selected configuration and preparation manifest under `.super-personal-agent-resources/`. A resumed task verifies that the manifest names the same task, selected resources and directories. Git reuse also checks the common Git directory, checked-out branch, worktree root and ancestry from the pinned base; commits and dirty task files are preserved. A copied directory carries its own ownership marker. An unknown directory, missing marker, changed branch, changed remote or removed ready worktree stops preparation with an error instead of adopting or replacing it.

Preparation records ownership before creating worktrees. If a command finishes but its response is lost, retry verifies the retained worktree before marking it ready. If the second resource fails, the first remains available and is verified on retry. A plain directory is published by rename after copying completes; incomplete owned staging copies are retried. Do not remove the ownership markers as a cleanup step while retaining the associated worktrees.

## Integration

`RepositoryRegistry.select(configs, ids)` validates explicit IDs and returns serializable `RepositorySelection[]`. Persist these selections with the task before dispatch. `prepare(ticketId, taskDirectory, selections, signal)` prepares or verifies them and returns `PreparedRepository[]`, including worker directories, branch names and base revisions. Run it before creating or waking the worker, including retries where the task directory already exists. Give the worker the returned directory map; do not make it infer which repository a command should use.

The injected `git(args, cwd, signal)` runner must use the executor's scoped environment and honor cancellation. Configuration changes affect new selections; they must not silently redirect an already accepted task to another resource. The returned results contain no credential material.

## Acceptance and local configuration

`pnpm test tests/repositories.spec.ts` creates real Git repositories and directory resources under the operating system's temporary directory, removes them after each test, and uses an empty global Git configuration. It covers no-resource tasks, two repositories, dirty source preservation, task commits, remote revision changes through a local `file:` URL, recovery after an interrupted command, concurrent preparation and refusal of unowned or unsafe paths. These tests do not use any existing project, real hosting account or remote server. Formal use needs the desired local paths or Git remotes, refs and explicit resource IDs; replace all example paths before enabling resource selection.
