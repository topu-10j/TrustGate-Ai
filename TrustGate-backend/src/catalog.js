import { readFileSync } from "node:fs";

function normalize(text) {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function buildMatcher(alias) {
  const phrase = normalize(alias);
  if (/^[a-z0-9 -]+$/.test(phrase)) {
    const words = new RegExp(`(?<![a-z0-9])${phrase}(?![a-z0-9])`, "u");
    return (text) => words.test(text);
  }
  // Bangla aliases may have suffixes, for example বাজেটটা.
  return (text) => text.includes(phrase);
}

const records = JSON.parse(readFileSync(new URL("../data/company.json", import.meta.url), "utf8"))
  .map(({ aliases, ...record }) => ({
    record: Object.freeze(record),
    matchers: aliases.map(buildMatcher)
  }));

export function findRequestedRecords(question) {
  const text = normalize(question);
  return records
    .filter(({ matchers }) => matchers.some((matches) => matches(text)))
    .map(({ record }) => record);
}

// These exact shortcuts in Secure Chat describe the built-in company records,
// not an arbitrary Vault document that happens to share a search word.
const builtInDemoQuestions = new Set([
  "what are the office hours",
  "what is the confidential budget",
  "what is the project deadline"
]);

export function isBuiltInDemoQuestion(question) {
  return builtInDemoQuestions.has(normalize(question).replace(/[?.!]+$/, "").trim());
}
