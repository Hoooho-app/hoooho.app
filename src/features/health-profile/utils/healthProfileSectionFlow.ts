export type HealthProfileSectionView = 'create' | 'list'

export function getInitialHealthProfileSectionView(
  records: readonly unknown[]
): HealthProfileSectionView {
  return records.length === 0 ? 'create' : 'list'
}
