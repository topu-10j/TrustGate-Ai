import { createServer } from "./server.js";
import { loadLocalAuthenticator } from "./local-accounts.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a whole number from 1 to 65535.");
  process.exit(1);
}

const options = process.env.FRONTEND_ORIGIN
  ? { allowedOrigins: [process.env.FRONTEND_ORIGIN] }
  : {};
const loginMode = process.argv.includes("--login");
if (loginMode) {
  try {
    options.authenticate = await loadLocalAuthenticator();
  } catch (error) {
    console.error(error.code === "ENOENT"
      ? "Local test accounts are missing. Run npm run login:setup first."
      : "Could not read the local account store.");
    process.exit(1);
  }
}
const server = createServer(options);

server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE"
    ? `Port ${port} is already in use. Set PORT to a different port.`
    : `Could not start TrustGate: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`TrustGate ${loginMode ? "local login mode" : "local demo"} running at http://127.0.0.1:${port}`);
});
