import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a whole number from 1 to 65535.");
  process.exit(1);
}

const options = process.env.FRONTEND_ORIGIN
  ? { allowedOrigins: [process.env.FRONTEND_ORIGIN] }
  : {};
const server = createServer(options);

server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE"
    ? `Port ${port} is already in use. Set PORT to a different port.`
    : `Could not start TrustGate: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`TrustGate local demo running at http://127.0.0.1:${port}`);
});
