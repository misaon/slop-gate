import type { LanguageId } from '../languages.ts'
import type { WorkspaceNode } from './workspaces.ts'

export type InventoryFile = {
  readonly path: string
  readonly language: LanguageId
  readonly workspace: string
  readonly size: number
  readonly mtimeMs: number
}

export type FileInventory = {
  readonly root: string
  readonly files: readonly InventoryFile[]
  readonly languages: ReadonlySet<LanguageId>
  readonly workspaces: readonly WorkspaceNode[]
}
