import { CONCEPT_GROUPS, type ConceptDefinition, type ConceptGroup } from './catalogue.ts'

const ID_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/

export function validateCatalogue(concepts: readonly ConceptDefinition[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const known = new Set(concepts.map((c) => c.id))

  for (const concept of concepts) {
    if (seen.has(concept.id)) problems.push(`duplicate concept id: ${concept.id}`)
    seen.add(concept.id)

    if (!ID_PATTERN.test(concept.id)) problems.push(`malformed concept id: ${concept.id}`)

    if (!CONCEPT_GROUPS.includes(concept.group as ConceptGroup)) {
      problems.push(`concept ${concept.id} declares unknown group ${concept.group}`)
    } else if (concept.id.split('.')[0] !== concept.group) {
      problems.push(`concept ${concept.id} declares group ${concept.group}`)
    }

    if (!concept.title.trim()) problems.push(`concept ${concept.id} has no title`)
    if (!concept.description.trim()) problems.push(`concept ${concept.id} has no description`)

    const replacement = concept.deprecated?.replacedBy
    if (replacement !== undefined && !known.has(replacement)) {
      problems.push(`${concept.id} is replaced by unknown concept ${replacement}`)
    }
  }

  return problems
}
