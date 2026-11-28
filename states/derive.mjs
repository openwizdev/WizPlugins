export function parsePlanLinks() {
  return { valid: false, links: new Map() };
}

export function deriveStates({ read_at, budget }) {
  return {
    schema: "openwiz.states.v1",
    read_at,
    budget,
    tickets: [],
    agents: [],
    tracks: [],
    unavailable: [],
  };
}
