/** Repository-owned expert packages shipped with the plugin. */
import { packagePath } from '../infra/paths.ts'

/** Stable catalog IDs; existing publications remain user-owned after installation. */
export const BUNDLED_EXPERT_IDS = ['builtin-research', 'builtin-writing', 'builtin-software', 'builtin-data', 'builtin-planning'] as const
/** Resolve resources from source or the installed package, never the current working directory. */
export const bundledExperts = () => BUNDLED_EXPERT_IDS.map(id => ({ id, directory: packagePath('experts', id) }))
