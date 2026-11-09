/** Main routes can explicitly select an expert or stay general; task continuations keep their binding. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
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
  expect(worker.replaceAll(h.directory, '[state]')).toMatchSnapshot()
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
