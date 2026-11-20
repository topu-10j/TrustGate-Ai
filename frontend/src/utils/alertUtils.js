export function incidentId(event) {
  const id = String(event?.id ?? "");
  return typeof event?.type === "string" && typeof event?.severity === "string" && /^\d{1,18}$/.test(id) ? id : null;
}

export function alertIdentity(event) {
  const id = incidentId(event);
  if (id !== null) return "incident:" + id;
  const explicit = event?.id ?? event?.eventId ?? event?.event_id;
  if (explicit !== undefined && explicit !== null && String(explicit).length) return String(explicit);
  return [event?.timestamp ?? "no-timestamp", event?.role ?? "unknown-role", event?.decision ?? "unknown-decision", event?.reasonCode ?? "no-reason", event?.source ?? "", event?.message ?? ""].join("|");
}

export function alertDestination(event) {
  const incident = incidentId(event);
  if (incident !== null) return `/?incident=${incident}#security-incidents`;
  const params = new URLSearchParams({
    event: event?.timestamp ?? event?.id ?? "", role: event?.role ?? "",
    decision: event?.decision ?? "", reason: event?.reasonCode ?? ""
  });
  return "/logs?" + params;
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
