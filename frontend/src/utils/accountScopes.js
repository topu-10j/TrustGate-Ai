export function appendAccountScope(current, kind, input) {
  const value = input.trim();
  if (!["department", "project"].includes(kind) || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(value)) {
    throw new Error("Use a lowercase scope code with letters, numbers, underscores or hyphens.");
  }
  if (current.some(item => item.kind === kind && item.value === value)) return current;
  if (current.length >= 20) throw new Error("This account already has the maximum of 20 scopes.");
  return [...current, { kind, value }];
}
