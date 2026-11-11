/** Presentation of result identity preserves media and durable per-part delivery. */
import { expect, it } from 'vitest'
import { attributedBlocks, attributionFooter } from '../src/messaging/attribution.ts'
import { ContentBlockSchema, publicationText, type ContentBlock } from '../src/messaging/content.ts'
import { prepareFeishuBlocks } from '../src/connectors/native-delivery.ts'

it('appends one signature after mixed content and channel splitting without changing the original', () => {
  const blocks: ContentBlock[] = [{ type: 'text', text: '分析'.repeat(30), format: 'markdown' }, { type: 'image', artifactId: 'chart' }, { type: 'file', artifactId: 'data' }]
  const delivered = prepareFeishuBlocks(attributedBlocks(blocks, { kind: 'expert', id: 'analyst', name: '数据分析', digest: 'a'.repeat(64) }), 25)
  expect(delivered.filter(block => block.type === 'image')).toEqual([blocks[1]])
  expect(delivered.filter(block => block.type === 'file')).toEqual([blocks[2]])
  expect(delivered.at(-1)).toMatchObject({ type: 'text' })
  expect(delivered.filter(block => block.type === 'text').map(block => block.text).join('').match(/来自专家/g)).toHaveLength(1)
  expect(blocks).toHaveLength(3)
  expect(publicationText(blocks)).not.toContain('来自')
})

it('retains the text-block size limit and does not rewrite plain text', () => {
  for (const block of [{ type: 'text', text: 'a'.repeat(128_000), format: 'markdown' }, { type: 'text', text: 'copy *literally*', format: 'plain' }] as const) {
    const blocks = attributedBlocks([block], { kind: 'general' })
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual(block)
    for (const part of blocks) expect(ContentBlockSchema.safeParse(part).success).toBe(true)
  }
})

it('leaves historical authors unknown and treats expert names as literal single-line text', () => {
  expect(attributionFooter(undefined)).toBe('')
  const name = '[Writer](https://example.com)\n# Admin'
  const footer = attributionFooter({ kind: 'expert', id: 'writer', name, digest: 'b'.repeat(64) })
  expect(footer).not.toContain('\n')
  expect(footer).not.toContain('[Writer](')
  expect(attributedBlocks([{ type: 'image', artifactId: 'old' }], undefined)).toEqual([{ type: 'image', artifactId: 'old' }])
})
