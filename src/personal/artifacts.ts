/** Reads an explicitly published text deliverable from the current task's workspace. */
import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { z } from 'zod'

export const ArtifactConfigSchema = z.object({ maxBytes: z.number().int().min(1024).max(4 * 1024 * 1024).default(512 * 1024) }).strict()
/** Rejects traversal, escaping symbolic links, non-files and oversized content before decoding UTF-8. */
export async function artifactText(workspace: string, path: string, maxBytes: number): Promise<string> {
  if (!path || isAbsolute(path) || path.split(/[\\/]/).includes('..') || path.includes('\0')) throw new Error('Artifact path must stay inside the task workspace')
  const root = await realpath(workspace), target = await realpath(resolve(root, path)), local = relative(root, target)
  if (!local || local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error('Artifact escapes the task workspace')
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size > maxBytes) throw new Error('Artifact must be a text file within the configured size limit')
    const bytes = Buffer.alloc(maxBytes + 1)
    let length = 0
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > maxBytes) throw new Error('Artifact grew beyond the configured size limit')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length))
    if (text.includes('\0')) throw new Error('Binary files cannot be published as text artifacts')
    return text
  } finally { await file.close() }
}
