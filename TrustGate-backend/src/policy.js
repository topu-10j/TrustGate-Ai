const ROLE_LEVEL = new Map([
  ["intern", 0],
  ["employee", 1],
  ["admin", 2]
]);

const ACCESS_LEVEL = new Map([
  ["public", 0],
  ["employee", 1],
  ["confidential", 2]
]);

export function isDemoRole(role) {
  return ROLE_LEVEL.has(role);
}

export function canRead(role, access) {
  return isDemoRole(role) &&
    ACCESS_LEVEL.has(access) &&
    ROLE_LEVEL.get(role) >= ACCESS_LEVEL.get(access);
}
