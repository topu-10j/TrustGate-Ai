export function canAccessRoute(role, path) {
  const privileged = new Set(["/logs", "/analytics", "/vault"]);
  if (!["admin", "employee", "intern"].includes(role)) return false;
  return privileged.has(path) ? role === "admin" : true;
}
