const loopback = ["127.0.0.1", "localhost"];
const hostname = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;

export function deploymentConfig(env, postgresMode) {
  const bindHost = env.TRUSTGATE_BIND_HOST || "127.0.0.1";
  if (bindHost !== "0.0.0.0" && !loopback.includes(bindHost)) throw new Error("Invalid TRUSTGATE_BIND_HOST.");
  const secureCookies = bindHost === "0.0.0.0" || env.TRUSTGATE_SECURE_COOKIES === "1";
  const allowedHosts = (env.TRUSTGATE_ALLOWED_HOSTS || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  const front = (env.FRONTEND_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (allowedHosts.some((host) => !hostname.test(host))) throw new Error("Invalid TRUSTGATE_ALLOWED_HOSTS.");
  if (front.some((origin) => {
    try { const value = new URL(origin); return !["http:", "https:"].includes(value.protocol) || value.origin !== origin; }
    catch { return true; }
  })) throw new Error("Invalid FRONTEND_ORIGIN.");
  if (secureCookies && (!postgresMode || !allowedHosts.length || !front.length ||
      front.some((origin) => !origin.startsWith("https://")))) {
    throw new Error("Network mode requires PostgreSQL, explicit hosts and HTTPS frontend origins.");
  }
  return { bindHost, secureCookies, allowedHosts, allowedOrigins: front.length ? front : undefined };
}
