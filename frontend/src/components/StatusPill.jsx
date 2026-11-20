const styles = {
  LOW: "pill-green", MEDIUM: "pill-yellow", HIGH: "pill-orange", CRITICAL: "pill-red",
  ALLOW: "pill-green", WARN: "pill-yellow", WARNING: "pill-yellow", REVIEW: "pill-orange", BLOCK: "pill-red",
  SAFE: "pill-green", BLOCKED: "pill-red", MONITORING: "pill-blue",
  ALLOWED: "pill-green", DENIED: "pill-red"
};
export default function StatusPill({ value = "PENDING" }) {
  const key = String(value).toUpperCase();
  return <span className={`status-pill ${styles[key] || "pill-neutral"}`}>{key}</span>;
}
