import type { LanguageId } from '../languages.ts'
import type { WorkspaceNode } from './workspaces.ts'

export type InventoryFile = {
  /** Repo-relative, POSIX separators. */
  readonly path: string
  readonly language: LanguageId
  /** Repo-relative POSIX directory of the owning workspace; empty string for the root. */
  readonly workspace: string
  readonly size: number
  readonly mtimeMs: number
}

export type FileInventory = {
  /** Absolute path of the repository root. The only absolute path in the model. */
  readonly root: string
  readonly files: readonly InventoryFile[]
  readonly languages: ReadonlySet<LanguageId>
  readonly workspaces: readonly WorkspaceNode[]
}
