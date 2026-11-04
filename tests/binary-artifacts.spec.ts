/** Binary file snapshots survive workspace edits and enforce publication ownership. */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { ArtifactFiles } from '../src/messaging/files.ts'
import { startRuntime } from './fixtures/host.ts'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

it('snapshots binary bytes and rejects corrupted persisted content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spa-binary-'))
  try {
    const workspace = join(root, 'work'), files = new ArtifactFiles(join(root, 'files'))
    await mkdir(workspace)
    const bytes = Buffer.from([0, 1, 2, 255])
    await writeFile(join(workspace, 'result.pdf'), bytes)
    const { file } = await files.capture(workspace, 'result.pdf', 1024)
    await writeFile(join(workspace, 'result.pdf'), 'changed')
    expect(await files.read(file)).toEqual(bytes)
    await expect(files.capture(workspace, '../files/private', 1024)).rejects.toThrow('inside')
    await writeFile(join(root, 'files', file.digest), Buffer.from([0, 1, 3, 255]))
    await expect(files.read(file)).rejects.toThrow('digest')
  } finally { await rm(root, { recursive: true, force: true }) }
})
it('publishes only selected artifacts and shares the rich result receipt with Main reply', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  try {
    const trigger = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Prepare a report and chart' }], source: { kind: 'user' } }))!
    const response = await h.runTool(h.runtime.masterId, 'personal_agent_submit', { trigger_id: trigger.id, title: 'Report', worktree_name: 'report' })
    await h.runtime.idle()
    const id = (response.ticket as { ticket_id: string }).ticket_id, session = `spa-worker-${id}`
    const workspace = h.runtime.store.tickets.get(id)!.execution!.directory
    await writeFile(join(workspace, 'report.pdf'), Buffer.from([0, 1, 255]))
    const artifact = await h.runTool(session, 'personal_agent_artifact', { path: 'report.pdf', title: 'Report' })
    await expect(h.runTool(session, 'personal_agent_report', { state: 'ready', summary: 'Done', publication: { mode: 'publish', blocks: [{ type: 'file', artifactId: 'invented' }] } })).rejects.toThrow('outside')
    const blocks = [{ type: 'text', text: 'Here is the report', format: 'markdown' }, { type: 'file', artifactId: artifact.artifact_id }]
    expect(await h.runTool(session, 'personal_agent_report', { state: 'ready', summary: 'Internal completion detail', publication: { mode: 'publish', blocks } })).toMatchObject({ publication: 'queued' })
    await h.runtime.idle()
    const result = h.runtime.results.list(id).find(item => item.state === 'ready')!
    expect(result.artifacts).toHaveLength(1)
    const reply = h.runtime.engine.reply({ purpose: 'result', ticketId: id, text: 'A rewritten summary' })
    expect(h.runtime.store.receipts.get(reply.id)?.blocks).toEqual(blocks)
    expect((await h.runtime.results.materialize(String(artifact.artifact_id))).bytes).toEqual(Buffer.from([0, 1, 255]))
  } finally { await h.stop() }
})
