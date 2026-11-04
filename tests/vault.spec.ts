import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResultRecord } from '../src/app/results.ts'
import { Store } from '../src/app/store.ts'
import { Vault, VaultConfigSchema, vaultExports, vaultMarkdown, type VaultConfig } from '../src/personal/vault.ts'

const cleanups: (() => void)[] = []
afterEach(() => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) cleanup() })

function host() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'personal-vault-')))
  const store = new Store(join(root, 'state.sqlite'))
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const vaultRoot = join(root, 'vault')
  mkdirSync(vaultRoot)
  let config: VaultConfig = VaultConfigSchema.parse({ enabled: true, root: vaultRoot })
  const configOf = () => config
  const vault = new Vault(store, configOf)
  return { root, vaultRoot, store, vault, configOf, configure: (next: Partial<VaultConfig>) => { config = VaultConfigSchema.parse({ ...config, ...next }) } }
}

function result(overrides: Partial<ResultRecord> = {}): ResultRecord {
  return { version: 1, id: 'result-1', ticketId: 'ticket-1', assignmentId: 'assignment-1', at: '2026-11-04T01:02:03Z',
    state: 'done', title: '旅行计划', summary: '## 行程\n\n第一天去海边。', url: 'http://127.0.0.1:1234/super-personal-agent/result/result-1',
    contexts: [{ id: 'context-1', traceId: 'trace-1', triggerId: 'trigger-1' }], ...overrides }
}

const targetFor = (root: string, id: string) => join(root, 'Personal Agent', 'Results', `${createHash('sha256').update(id).digest('hex')}.md`)

describe('Vault Markdown projection', () => {
  it('defaults to disabled with no root and rejects directory escapes and invalid enabled roots', () => {
    expect(VaultConfigSchema.parse({})).toEqual({ enabled: false, root: '', directory: 'Personal Agent' })
    for (const directory of ['../other', '/outside', 'notes/../other', 'notes//other', 'notes\\other', '.', 'notes\0other'])
      expect(VaultConfigSchema.safeParse({ directory }).success).toBe(false)
    expect(VaultConfigSchema.safeParse({ enabled: true }).success).toBe(false)
    expect(VaultConfigSchema.safeParse({ root: 'relative' }).success).toBe(false)
    const h = host()
    h.configure({ enabled: false, root: '' })
    expect(h.vault.enqueue(result())).toBeUndefined()
    expect(h.vault.list()).toEqual([])
    expect(readdirSync(h.vaultRoot)).toEqual([])
  })

  it('writes a stable result snapshot with versioned IDs and context references, and retries idempotently after restart', async () => {
    const h = host(), snapshot = result(), queued = h.vault.enqueue(snapshot)!
    const published = await h.vault.publish(queued.id)
    expect(published).toMatchObject({ state: 'written', resultId: snapshot.id, ticketId: snapshot.ticketId })
    expect(published.path).toBe(targetFor(h.vaultRoot, snapshot.id))
    expect(readFileSync(published.path!, 'utf8')).toBe(vaultMarkdown(snapshot))
    expect(readFileSync(published.path!, 'utf8')).toContain('context_refs: [{"id":"context-1","trace_id":"trace-1","trigger_id":"trigger-1"}]')
    expect(published.uri).toBe(`obsidian://open?path=${encodeURIComponent(published.path!)}`)
    const restarted = new Vault(h.store, h.configOf)
    expect(restarted.enqueue(snapshot)?.id).toBe(queued.id)
    expect((await restarted.publish(queued.id)).state).toBe('unchanged')
    expect(restarted.list(snapshot.id)).toHaveLength(1)
    expect(readdirSync(join(h.vaultRoot, 'Personal Agent', 'Results'))).toHaveLength(1)
  })

  it('quotes frontmatter and hashes filenames even when result IDs and titles contain path or YAML syntax', async () => {
    const h = host(), snapshot = result({ id: '../../escape', title: 'A "title"\n---\nsecret: true' })
    const published = await h.vault.publish(h.vault.enqueue(snapshot)!.id)
    expect(published.path).toBe(targetFor(h.vaultRoot, snapshot.id))
    const text = readFileSync(published.path!, 'utf8')
    expect(text).toContain(`  title: ${JSON.stringify(snapshot.title)}\n`)
    expect(text.match(/^---$/gm)).toHaveLength(2)
    expect(text).not.toContain('senderId')
    expect(existsSync(join(h.root, 'escape.md'))).toBe(false)
  })

  it('preserves user edits and preexisting files instead of replacing them', async () => {
    const h = host(), queued = h.vault.enqueue(result())!, first = await h.vault.publish(queued.id)
    writeFileSync(first.path!, '# My edits\n')
    const preserved = await h.vault.publish(queued.id)
    expect(preserved.state).toBe('preserved')
    expect(readFileSync(first.path!, 'utf8')).toBe('# My edits\n')
    const second = h.vault.enqueue(result({ id: 'result-2' }))!
    const secondPath = targetFor(h.vaultRoot, second.resultId)
    writeFileSync(secondPath, '# Existing note\n')
    expect((await h.vault.publish(second.id)).state).toBe('preserved')
    expect(readFileSync(secondPath, 'utf8')).toBe('# Existing note\n')
  })

  it('keeps concurrent publication complete and leaves no temporary files', async () => {
    const h = host(), queued = h.vault.enqueue(result())!
    const outcomes = await Promise.all([h.vault.publish(queued.id), new Vault(h.store, h.configOf).publish(queued.id)])
    expect(outcomes.map(item => item.state).sort()).toEqual(['unchanged', 'written'])
    expect(readFileSync(outcomes[0]!.path!, 'utf8')).toBe(vaultMarkdown(result()))
    expect(readdirSync(join(h.vaultRoot, 'Personal Agent', 'Results'))).toHaveLength(1)
  })

  it('retains a retryable intent when the configured root is unavailable', async () => {
    const h = host()
    rmSync(h.vaultRoot, { recursive: true })
    const queued = h.vault.enqueue(result())!
    await expect(h.vault.publish(queued.id)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(h.vault.get(queued.id)).toMatchObject({ state: 'pending', error: expect.stringContaining('ENOENT') })
    mkdirSync(h.vaultRoot)
    const retried = await h.vault.publish(queued.id)
    expect(retried.state).toBe('written')
    expect(retried.error).toBeUndefined()
  })

  it('recovers publication if persisting its receipt failed after the file was written', async () => {
    const h = host(), queued = h.vault.enqueue(result())!, save = h.store.set.bind(h.store)
    let failed = false
    vi.spyOn(h.store, 'set').mockImplementation((name, value) => {
      if (!failed && name === vaultExports(queued.id) && typeof value === 'object' && value && 'state' in value && value.state === 'written') {
        failed = true
        throw new Error('simulated receipt failure')
      }
      save(name, value)
    })
    await expect(h.vault.publish(queued.id)).rejects.toThrow('simulated receipt failure')
    expect((await h.vault.publish(queued.id)).state).toBe('unchanged')
    expect(readFileSync(targetFor(h.vaultRoot, queued.resultId), 'utf8')).toBe(vaultMarkdown(result()))
  })

  it('does not redirect pending exports after configuration changes or publish while disabled', async () => {
    const h = host(), queued = h.vault.enqueue(result())!
    h.configure({ directory: 'Another folder' })
    await expect(h.vault.publish(queued.id)).rejects.toThrow('destination changed')
    expect(readdirSync(h.vaultRoot)).toEqual([])
    h.configure({ directory: 'Personal Agent', enabled: false })
    await expect(h.vault.publish(queued.id)).rejects.toThrow('disabled')
    h.configure({ enabled: true })
    expect((await h.vault.publish(queued.id)).state).toBe('written')
  })

  it('rejects symlink roots and descendant directories without writing outside the Vault', async () => {
    const h = host(), outside = join(h.root, 'outside')
    mkdirSync(outside)
    symlinkSync(outside, join(h.vaultRoot, 'Personal Agent'))
    const queued = h.vault.enqueue(result())!
    await expect(h.vault.publish(queued.id)).rejects.toThrow('symlinks')
    expect(readdirSync(outside)).toEqual([])
    const alias = join(h.root, 'alias')
    symlinkSync(h.vaultRoot, alias)
    h.configure({ root: alias })
    await expect(h.vault.publish(h.vault.enqueue(result({ id: 'other' }))!.id)).rejects.toThrow('not a symlink')
  })

  it('rejects symlink destination files instead of reading or replacing their targets', async () => {
    const h = host(), queued = h.vault.enqueue(result())!, outside = join(h.root, 'outside.md')
    const target = targetFor(h.vaultRoot, queued.resultId)
    mkdirSync(join(h.vaultRoot, 'Personal Agent', 'Results'), { recursive: true })
    writeFileSync(outside, 'private content')
    symlinkSync(outside, target)
    await expect(h.vault.publish(queued.id)).rejects.toThrow('not a symlink')
    expect(readFileSync(outside, 'utf8')).toBe('private content')
  })

  it('does not let a result ID silently change content or a corrupted intent choose another path', async () => {
    const h = host(), queued = h.vault.enqueue(result())!
    expect(() => h.vault.enqueue(result({ summary: 'Changed' }))).toThrow('immutable Vault result changed')
    h.store.set(vaultExports(queued.id), { ...queued, directory: '../outside' })
    await expect(h.vault.publish(queued.id)).rejects.toThrow()
    expect(readdirSync(h.vaultRoot)).toEqual([])
  })
})


it('exports exact binary artifacts with readable links and preserves an edited attachment', async () => {
  const h = host(), bytes = Buffer.from([0, 1, 255, 42]), file = { digest: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length, fileName: '旅行.pdf', mediaType: 'application/pdf' }, artifact = result({ id: 'file', file, artifactPath: '旅行.pdf', state: 'artifact' })
  const vault = new Vault(h.store, h.configOf, { get: id => id === 'file' ? artifact : undefined, materialize: async () => ({ file, bytes }) })
  const publication = result({ artifacts: [{ id: 'file', title: 'PDF', url: artifact.url }] }), intent = vault.enqueue(publication)!
  const exported = await vault.publish(intent.id), folder = join(h.vaultRoot, 'Personal Agent', 'Results', 'Attachments')
  const attachment = join(folder, `${file.digest}-${file.fileName}`)
  expect(readFileSync(attachment)).toEqual(bytes)
  expect(readFileSync(exported.path!, 'utf8')).toContain(encodeURIComponent(`${file.digest}-${file.fileName}`))
  expect((await vault.publish(intent.id)).state).toBe('unchanged')
  writeFileSync(attachment, 'edited by user')
  await expect(vault.publish(intent.id)).rejects.toThrow('preserved')
  expect(readFileSync(attachment, 'utf8')).toBe('edited by user')
})
