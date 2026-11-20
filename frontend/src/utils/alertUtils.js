export function alertIdentity(event) {
  const explicit = event?.id ?? event?.eventId ?? event?.event_id;
  if (explicit !== undefined && explicit !== null && String(explicit).length) return String(explicit);
  return [event?.timestamp ?? "no-timestamp", event?.role ?? "unknown-role", event?.decision ?? "unknown-decision", event?.reasonCode ?? "no-reason", event?.source ?? "", event?.message ?? ""].join("|");
}

const storageKey = (role) => `trustgate-alert-read:${role}`;

export function loadAlertReadKeys(storage, role) {
  try {
    const raw = storage?.getItem(storageKey(role));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function saveAlertReadKeys(storage, role, keys) {
  try {
    storage?.setItem(storageKey(role), JSON.stringify([...new Set(keys)]));
    return true;
  } catch {
    return false;
  }
}
