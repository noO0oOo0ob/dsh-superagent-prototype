/** Real ModLens adapter with a synthetic vision engine; no credentials, network or personal cache files are used. */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'
import { apply } from '@liustack/modlens'

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); syncBuiltinESMExports() })
const ref = { attachmentId: 'sha256:' + 'a'.repeat(64), mediaType: 'image/png', bytes: 8, width: 1, height: 1 }
function createAdapter(received) {
  let adapter
  const llm = {
    listProviders: () => [{ id: 'test-text', name: 'Test text' }],
    listModels: async () => [{ id: 'deepseek-test', inputModalities: ['text'] }],
    resolveModelInfo: async () => ({ id: 'deepseek-test', inputModalities: ['text'] }),
    registerAdapter: (ids, value) => { expect(ids).toEqual(['modlens-test-text']); adapter = value; return () => {} },
    stream: async function* (options) { received.push(options) },
  }
  apply({ llm, tools: { register: () => {} }, on: () => {}, attachments: {
    readImage: async () => ({ ref, data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) }),
  } }, { upstream: 'test-text', settingsCard: false, pasteToPath: false })
  return adapter
}
it('keeps one upstream route from text to nested images and reuses identical evidence across adapter reloads', async () => {
  const directory = mkdtempSync(join(os.tmpdir(), 'spa-modlens-'))
  try {
    const engine = join(directory, 'vision-fixture.cjs'), count = join(directory, 'reads')
    writeFileSync(engine, `require('node:fs').appendFileSync(${JSON.stringify(count)}, 'read\\n'); console.log(JSON.stringify({result:{summary:'Synthetic landmark evidence',ocr:{full_text:'Beijing landmark'},uncertainty:[]}}))`)
    vi.stubEnv('MODLENS_DSH_CLI', engine)
    vi.spyOn(os, 'homedir').mockReturnValue(directory); syncBuiltinESMExports()
    const received = []
    const adapter = createAdapter(received), base = { provider: 'modlens-test-text', model: 'deepseek-test', reasoningEffort: 'low' }
    const first = [{ role: 'user', content: [{ type: 'text', text: 'Plan a Beijing trip.' }] }]
    for await (const chunk of adapter.stream({ ...base, messages: first })) void chunk
    expect(existsSync(count)).toBe(false)
    const followup = [...first, { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'personal-agent-inbound', content: [
      { type: 'text', text: 'Add this landmark' }, { type: 'image', attachment: ref },
    ] }] }]
    for (const instance of [adapter, adapter, createAdapter(received)]) {
      for await (const chunk of instance.stream({ ...base, messages: followup })) void chunk
    }
    expect(readFileSync(count, 'utf8')).toBe('read\n')
    for (const request of received) expect(request).toMatchObject({ provider: 'test-text', model: 'deepseek-test', reasoningEffort: 'low' })
    expect(received[1].messages[1].content[0].content[1]).toMatchObject({ type: 'text', text: expect.stringContaining('Beijing landmark') })
    expect(received[1].messages).toEqual(received[2].messages)
    expect(received[1].messages).toEqual(received[3].messages)
    expect(followup[1].content[0].content[1].type).toBe('image')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
it('keeps image failures visible and stable instead of inventing evidence or switching the upstream model', async () => {
  const directory = mkdtempSync(join(os.tmpdir(), 'spa-modlens-failure-'))
  try {
    const engine = join(directory, 'failed-engine.cjs'), count = join(directory, 'reads')
    writeFileSync(engine, `require('node:fs').appendFileSync(${JSON.stringify(count)}, 'read\\n'); console.error('Synthetic engine unavailable'); process.exit(1)`)
    vi.stubEnv('MODLENS_DSH_CLI', engine)
    vi.spyOn(os, 'homedir').mockReturnValue(directory); syncBuiltinESMExports()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const received = [], adapter = createAdapter(received)
    const request = { provider: 'modlens-test-text', model: 'deepseek-test', messages: [
      { role: 'user', content: [{ type: 'image', attachment: ref }] },
    ] }
    for (let i = 0; i < 2; i++) for await (const chunk of adapter.stream(request)) void chunk
    expect(readFileSync(count, 'utf8')).toBe('read\n')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('image read failed (engine)'))
    expect(received[0]).toMatchObject({ provider: 'test-text', model: 'deepseek-test' })
    expect(received[0].messages[0].content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('vision engine failed. Tell the user') })
    expect(received[1].messages).toEqual(received[0].messages)
    expect(request.messages[0].content[0].type).toBe('image')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
