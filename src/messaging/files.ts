/** Immutable content-addressed files referenced by durable result records. */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, link, unlink } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { z } from 'zod'
import { artifactBytes } from '../personal/artifacts.ts'

export const StoredFileSchema = z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().nonnegative(),
  fileName: z.string().min(1).refine(name => !/[\\/\x00-\x1f]/.test(name)), mediaType: z.string().min(1).max(200) }).strict()
export type StoredFile = z.infer<typeof StoredFileSchema>
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const mediaTypes: Record<string, string> = { '.md': 'text/markdown', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.zip': 'application/zip',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

/** Owns snapshots under the plugin state directory; filenames never determine storage paths. */
export class ArtifactFiles {
  constructor(private readonly root: string) {}
  /** Snapshot a task-relative file before a result can reference it. */
  async capture(workspace: string, path: string, maxBytes: number): Promise<{ file: StoredFile; bytes: Buffer }> {
    const bytes = await artifactBytes(workspace, path, maxBytes)
    const file = StoredFileSchema.parse({ digest: hash(bytes), size: bytes.length, fileName: basename(path),
      mediaType: mediaTypes[extname(path).toLowerCase()] ?? 'application/octet-stream' })
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const temporary = join(this.root, `.${file.digest}-${randomUUID()}`)
    const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
    try {
      try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
      try { await link(temporary, join(this.root, file.digest)) }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error }
      await this.read(file)
      const directory = await open(this.root, constants.O_RDONLY)
      try { await directory.sync() } finally { await directory.close() }
    } finally { await unlink(temporary) }
    return { file, bytes }
  }
  /** Validate the persisted descriptor and digest before bytes cross a channel boundary. */
  async read(value: StoredFile): Promise<Buffer> {
    const file = StoredFileSchema.parse(value)
    const handle = await open(join(this.root, file.digest), constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size !== file.size) throw new Error('Artifact snapshot size changed')
      const bytes = await handle.readFile()
      if (bytes.length !== file.size || hash(bytes) !== file.digest) throw new Error('Artifact snapshot digest changed')
      return bytes
    } finally { await handle.close() }
  }
}
