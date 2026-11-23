export function useRestriction() {
  return {
    blocked: false as boolean,
    blockedUntil: null as string | null,
    reason: null as string | null,
  };
}

export function formatRemaining(_until: string | null) {
  return "";
}
