/** Captured result authors and their channel-independent delivery footer. */
import { z } from 'zod'
import type { ContentBlock } from './content.ts'

/** Absent on historical results; general work is distinct from an unknown author. */
export const AttributionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('expert'), id: z.string(), name: z.string(), digest: z.string() }).strict(),
  z.object({ kind: z.literal('general') }).strict(),
])
export type Attribution = z.infer<typeof AttributionSchema>

/** Render captured identity as text; names cannot create Markdown links or extra lines. */
export function attributionFooter(author: Attribution | undefined): string {
  if (!author) return ''
  if (author.kind === 'general') return '— 来自通用助手 / From general assistant'
  const name = author.name.replace(/\s+/gu, ' ').replace(/[\\`*_{}\[\]()<>!#|~]/g, '\\$&')
  return `— 来自专家 / From expert: ${name}`
}

/** Add one footer to a publication without modifying the saved author content. */
export function attributedBlocks(blocks: readonly ContentBlock[], author: Attribution | undefined): ContentBlock[] {
  const footer = attributionFooter(author)
  if (!footer) return [...blocks]
  const last = blocks.at(-1)
  if (last?.type === 'text' && last.format === 'markdown' && last.text.length + footer.length + 2 <= 128_000)
    return [...blocks.slice(0, -1), { ...last, text: `${last.text}\n\n${footer}` }]
  return [...blocks, { type: 'text', text: footer, format: 'markdown' }]
}
