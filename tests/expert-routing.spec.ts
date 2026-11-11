/** Main routes can explicitly select an expert or stay general; task continuations keep their binding. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { resultHtml, resultRecords } from '../src/app/results.ts'
import { checkedImText } from '../src/infra/text.ts'
import { publicationText } from '../src/messaging/content.ts'
import { startRuntime, feishu, type Host } from './fixtures/host.ts'
let h: Host
beforeEach(async () => { h = await startRuntime() })
afterEach(async () => h.stop())
function expert() {
  const directory = join(h.directory, 'travel'); mkdirSync(join(directory, '.codex-plugin'), { recursive: true })
  writeFileSync(join(directory, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'travel', description: 'Multi-day travel planning; not code changes' }))
  writeFileSync(join(directory, 'AGENTS.md'), 'Check travel distances and practical schedules.')
  writeFileSync(join(directory, 'SOUL.md'), 'Speak like a patient travel adviser.')
  mkdirSync(join(directory, 'skills/itinerary/references'), { recursive: true })
  writeFileSync(join(directory, 'skills/itinerary/SKILL.md'), '---\nname: itinerary\ndescription: Plan trips\n---\nRead references/check.md.')
  writeFileSync(join(directory, 'skills/itinerary/references/check.md'), 'Check routes')
  writeFileSync(join(directory, 'personal-agent.yaml'), 'schemaVersion: 1\nentry:\n  preloadSkills: [itinerary]\n')
  const preview = h.runtime.experts.preview({ directory }); h.runtime.experts.save({ directory }, preview.digest, 0); h.runtime.experts.enable('travel', 1, true)
  return { id: 'travel', digest: preview.digest, reason: 'The user requests a multi-day itinerary.' }
}
async function accept(id: string, selection?: ReturnType<typeof expert> | null) {
  const trigger = feishu(id, 'Plan a seven day trip'); h.runtime.receive(trigger); await h.runtime.idle()
  const result = await h.route({ kind: 'accept', trigger_id: trigger.id, title: 'Travel plan', worktree_name: 'travel-plan', acknowledgement: '收到。', expert: selection })
  await h.runtime.idle()
  return h.runtime.store.tickets.get((result.ticket as { ticket_id: string }).ticket_id)!
}
it('exposes descriptions to Main, then loads only the selected AGENTS and SOUL into its Worker', async () => {
  const selection = expert()
  const catalog = await h.runTool(h.runtime.masterId, 'personal_agent_experts', {})
  expect(catalog).toMatchObject({ experts: [{ id: 'travel', digest: selection.digest }] })
  expect(JSON.stringify(catalog)).not.toContain('patient travel adviser')
  const ticket = await accept('1', selection)
  expect(ticket.expert?.reason).toBe(selection.reason)
  const worker = h.promptSections.get(`spa-worker-${ticket.id}`)!({})
  expect(worker).toContain('resource directory:'); expect(worker).toContain('/skills/itinerary]'); expect(worker).toContain('Check travel distances'); expect(worker).toContain('patient travel adviser')
  expect(h.promptSections.get(h.runtime.masterId)!({})).not.toContain('patient travel adviser')
  expect(worker.split('[dsh-super-personal-agent prompt revision')[0]!.replaceAll(h.directory, '[state]')).toMatchSnapshot()
})
it.each([undefined, null])('allows no expert even when a specialist is available (%s)', async selection => {
  expert(); const ticket = await accept('2', selection)
  expect(ticket.expert).toBeUndefined()
  const text = h.promptSections.get(`spa-worker-${ticket.id}`)!({})
  expect(text).toContain('[Expert SOUL]'); expect(text).not.toContain('patient travel adviser')
})
it('rejects a stale or missing explicit expert without creating a Ticket', async () => {
  const selection = expert()
  await expect(accept('3', { ...selection, digest: 'f'.repeat(64) })).rejects.toThrow('changed')
  expect(h.runtime.store.tickets.list()).toEqual([])
  await expect(accept('4', { ...selection, id: 'missing' })).rejects.toThrow('unavailable')
  expect(h.runtime.store.tickets.list()).toEqual([])
})
it('does not let a follow-up replace the expert; duplicate acceptance keeps its snapshot', async () => {
  const selection = expert(), ticket = await accept('5', selection)
  const follow = feishu('6', 'Make day three easier'); h.runtime.receive(follow); await h.runtime.idle()
  await expect(h.route({ kind: 'attach', trigger_id: follow.id, ticket_id: ticket.id, expert: selection })).rejects.toThrow('only allowed')
  await h.route({ kind: 'attach', trigger_id: follow.id, ticket_id: ticket.id })
  expect(h.runtime.store.tickets.get(ticket.id)?.expert).toEqual(ticket.expert)
})

it('rejects a general-to-fixed expert change across model preflight before creating work', async () => {
  const selection = expert(), chosen = h.runtime.experts.select(selection)!
  vi.spyOn(h.runtime.expertPreferences, 'select').mockReturnValueOnce(undefined).mockReturnValueOnce(chosen)
  await expect(accept('racing', null)).rejects.toThrow('changed during model preflight')
  expect(h.runtime.store.tickets.list()).toEqual([])
})

it('offers presentation guidance lazily without changing the task expert', async () => {
  const ticket = await accept('71', expert()), session = `spa-worker-${ticket.id}`
  const skill = h.skills.get(session)?.get('dsh-super-personal-agent-reply-presentation')
  expect(skill?.description).toContain('comparisons')
  expect(skill?.content).toContain('publication.blocks')
  expect(h.promptSections.get(session)!({})).not.toContain(skill!.content)
  expect(h.skills.get(session)?.has('travel-itinerary')).toBe(true)
  expect(h.skills.get(h.runtime.masterId)?.has('dsh-super-personal-agent-reply-presentation')).toBe(true)
})

it('publishes the complete answer and captured expert author without requiring a file', async () => {
  const selection = expert(), ticket = await accept('72', selection)
  const content = '推荐第二条路线。\n\n| 路线 | 天数 |\n| --- | --- |\n| A | 3 |\n| B | 5 |\n\n[参考](https://example.com/routes)'
  await h.runTool(`spa-worker-${ticket.id}`, 'personal_agent_report', {
    state: 'ready', summary: 'Compared two routes.', publication: { mode: 'publish', blocks: [{ type: 'text', text: content }] },
  })
  await h.runtime.idle()
  const result = h.runtime.results.list(ticket.id)[0]!
  expect(result.attribution).toEqual({ kind: 'expert', id: 'travel', name: 'travel', digest: selection.digest })
  expect(result.artifacts).toEqual([])
  expect(result.publication).toMatchObject({ blocks: [{ text: content }] })
  const message = h.runtime.results.replyMessage({ purpose: 'result', ticket: h.runtime.store.tickets.get(ticket.id)!, channel: { source: 'inbox', thread: 'preview', address: {} } })!
  expect(message.attribution).toEqual(result.attribution)
  expect(message.text.replaceAll(result.url, '[result URL]')).toMatchSnapshot()
  expect(publicationText(message.blocks!)).toBe(`${content}\n\n— 来自专家 / From expert: travel`)
  expect(JSON.stringify(h.agents.get(h.runtime.masterId)!.inject.mock.calls)).toContain('From expert: travel')
  expect(resultHtml(result)).toContain('From expert: travel')

  // Later delivery must use the captured author, even if the task record or catalog changes.
  const current = h.runtime.store.tickets.get(ticket.id)!
  current.expert!.snapshot.name = 'Renamed'
  h.runtime.store.tickets.save(current)
  h.runtime.experts.enable('travel', 2, false)
  const again = h.runtime.results.replyMessage({ purpose: 'result', ticket: h.runtime.store.tickets.get(ticket.id)!, channel: { source: 'inbox', thread: 'later', address: {} } })!
  expect(again.attribution).toEqual(result.attribution)
  expect(again.text).not.toContain('Renamed')
  expect(again.text.match(/From expert:/g)).toHaveLength(1)

  h.runtime.store.set(resultRecords(result.id), { ...result, attribution: undefined })
  const legacy = h.runtime.results.replyMessage({ purpose: 'result', ticket: h.runtime.store.tickets.get(ticket.id)!, channel: { source: 'inbox', thread: 'legacy', address: {} } })!
  expect(legacy.attribution).toBeUndefined()
  expect(legacy.text).not.toContain('From expert:')
})

it('reserves room for author attribution in legacy Feishu summary notices', async () => {
  const ticket = await accept('73', expert())
  const current = h.runtime.store.tickets.get(ticket.id)!
  current.expert!.snapshot.name = 'Specialist '.repeat(20).trim()
  h.runtime.store.tickets.save(current)
  h.runtime.engine.report(ticket.id, { state: 'ready', summary: 'word '.repeat(85).trim() })
  const result = h.runtime.results.replyMessage({ purpose: 'result', ticket: h.runtime.store.tickets.get(ticket.id)!,
    channel: { source: 'feishu', thread: 'summary', address: { messageId: 'summary' } } })!
  expect(() => checkedImText(result.text)).not.toThrow()
  expect(result.text).toContain(current.expert!.snapshot.name)
})

it('uses a team presentation skill override and restores the bundled skill after removal', async () => {
  const name = 'dsh-super-personal-agent-reply-presentation'
  const initial = h.runtime.prompts.current()
  h.runtime.prompts.save({ ...initial.config, skills: { ...initial.config.skills, 'reply-presentation': 'Use our comparison format.' } }, initial.revision, 'panel')
  h.promptSections.get(h.runtime.masterId)!({ signal: new AbortController().signal })
  expect(h.skills.get(h.runtime.masterId)?.get(name)?.content).toBe('Use our comparison format.')
  const changed = h.runtime.prompts.current()
  h.runtime.prompts.save(initial.config, changed.revision, 'panel')
  h.promptSections.get(h.runtime.masterId)!({ signal: new AbortController().signal })
  expect(h.skills.get(h.runtime.masterId)?.get(name)?.content).toContain('publication.blocks')
})
