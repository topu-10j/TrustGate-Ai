export function chatWarnings(response) {
  if (!Array.isArray(response?.warnings)) return [];
  return response.warnings.flatMap(warning => {
    if (warning?.code !== "SCANNER_WARNING" || !["input", "output"].includes(warning.stage)) return [];
    const threats = Array.isArray(warning.threats)
      ? [...new Set(warning.threats.filter(item => typeof item === "string" && /^[A-Z_]+$/.test(item)))]
      : [];
    return [{ stage: warning.stage, threats }];
  });
}
