/** Versioned, ordered publication content shared by model tools and channel adapters. */
import { z } from 'zod'

const artifactId = z.string().min(1).max(256)
const media = { artifactId, caption: z.string().max(8000).optional() }
export const ContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(128_000), format: z.enum(['plain', 'markdown']).default('markdown') }).strict(),
  z.object({ type: z.literal('image'), ...media, alt: z.string().max(2000).optional() }).strict(),
  z.object({ type: z.literal('file'), ...media }).strict(),
  z.object({ type: z.literal('audio'), ...media, durationMs: z.number().nonnegative().optional() }).strict(),
  z.object({ type: z.literal('video'), ...media, thumbnailArtifactId: artifactId.optional() }).strict(),
  z.object({ type: z.literal('link'), url: z.url().refine(value => /^https?:\/\//.test(value)), label: z.string().min(1).max(2000) }).strict(),
  z.object({ type: z.literal('card'), title: z.string().min(1).max(200), text: z.string().max(8000),
    actions: z.array(z.object({ label: z.string().min(1).max(100), actionId: z.string().min(1).max(256) }).strict()).max(10).default([]) }).strict(),
])
export type ContentBlock = z.infer<typeof ContentBlockSchema>
export const PublicationSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('internal') }).strict(),
  z.object({ mode: z.literal('publish'), version: z.literal(1).default(1), blocks: z.array(ContentBlockSchema).min(1).max(64) }).strict(),
])
/** The current model surface exposes only formats implemented by native delivery. */
export const WorkerPublicationSchema = z.discriminatedUnion('mode', [PublicationSchema.options[0],
  PublicationSchema.options[1].extend({ blocks: z.array(z.discriminatedUnion('type', [ContentBlockSchema.options[0], ContentBlockSchema.options[1], ContentBlockSchema.options[2]])).min(1).max(64) })])
export type Publication = z.infer<typeof PublicationSchema>
/** Artifact references selected for this publication, including video thumbnails. */
export function publicationArtifacts(blocks: readonly ContentBlock[]): string[] {
  return [...new Set(blocks.flatMap(block => 'artifactId' in block
    ? [block.artifactId, ...(block.type === 'video' && block.thumbnailArtifactId ? [block.thumbnailArtifactId] : [])] : []))]
}
/** Readable transcript representation; media remain explicit references, never claimed sent. */
export function publicationText(blocks: readonly ContentBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case 'text': return block.text
      case 'link': return `[${block.label}](${block.url})`
      case 'card': return `${block.title}\n${block.text}`
      default: return block.caption ?? ('alt' in block ? block.alt : undefined) ?? `[${block.type}: ${block.artifactId}]`
    }
  }).join('\n\n')
}
