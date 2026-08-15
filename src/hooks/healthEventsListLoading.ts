export function startIndependentRegionLoads<TMembers, TEvents>(
  loadMembers: () => Promise<TMembers>,
  loadEvents: () => Promise<TEvents>
) {
  return {
    members: loadMembers(),
    events: loadEvents()
  }
}
