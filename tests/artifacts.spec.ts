/** Deliverables cannot read outside the worker workspace or masquerade as text. */
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { artifactText } from '../src/personal/artifacts.ts'

it('reads text once and rejects traversal, escaping links, binary and oversized files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spa-artifacts-')), workspace = join(root, 'work')
  try {
    await mkdir(workspace); await writeFile(join(workspace, 'plan.md'), '# Weekend\nWalk in the park')
    expect(await artifactText(workspace, 'plan.md', 1024)).toContain('Walk in the park')
    await writeFile(join(root, 'private.txt'), 'private'); await symlink(join(root, 'private.txt'), join(workspace, 'escape'))
    await expect(artifactText(workspace, '../private.txt', 1024)).rejects.toThrow('inside')
    await expect(artifactText(workspace, 'escape', 1024)).rejects.toThrow('escapes')
    await writeFile(join(workspace, 'large'), 'a'.repeat(1025)); await expect(artifactText(workspace, 'large', 1024)).rejects.toThrow('size limit')
    await writeFile(join(workspace, 'binary'), Buffer.from([0, 1, 2])); await expect(artifactText(workspace, 'binary', 1024)).rejects.toThrow('Binary')
    await expect(artifactText(workspace, '.', 1024)).rejects.toThrow()
    if (process.platform !== 'win32') {
      await promisify(execFile)('mkfifo', [join(workspace, 'pipe.md')])
      await expect(artifactText(workspace, 'pipe.md', 1024)).rejects.toThrow('text file')
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
