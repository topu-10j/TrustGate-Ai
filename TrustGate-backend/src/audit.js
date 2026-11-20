export const MAX_EVENTS = 100;

export function createAuditLog(now = Date.now) {
  const events = [];

  return {
    record({ role, decision, reasonCode }) {
      // Keep only the fields needed to explain a permission decision.
      events.push(Object.freeze({
        timestamp: new Date(now()).toISOString(),
        role,
        decision,
        reasonCode
      }));
      if (events.length > MAX_EVENTS) events.shift();
    },

    list() {
      return events.slice().reverse();
    }
  };
}
