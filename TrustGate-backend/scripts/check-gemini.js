import { findRequestedRecords } from "../src/catalog.js";
import { createGeminiAnswerProvider } from "../src/gemini-answer.js";
import { withPasswordPrompt } from "../src/password-prompt.js";

try {
  const key = process.env.GEMINI_API_KEY || await withPasswordPrompt((secret) => secret("Gemini API key: "));
  const answer = createGeminiAnswerProvider({ apiKey: key, model: process.env.TRUSTGATE_GEMINI_MODEL });
  const question = "What are the office hours?";
  const [record] = findRequestedRecords(question);
  const output = await answer({ record, question });
  console.log("Gemini connection OK.");
  console.log("Public demo answer:", output);
} catch (error) {
  // The provider only supplies fixed, redacted messages. Do not print raw upstream responses.
  console.error(error.code === "ABORT_ERR" ? "Cancelled." : error.message);
  process.exitCode = 1;
}
