import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { attachLogsWebSocket } from './logsWebSocket.js';
import { registerProcessGuards } from './processGuards.js';

// A single follow-stream error (or any in-flight runtime rejection) must not
// crash the backend: killing the process is what cascaded into HTTP 502 on
// describe/metrics through the Vite proxy. Log a sanitized report and stay up.
// Startup/bind-fatal paths below still exit non-zero on their own.
registerProcessGuards();

const app = createApp({ frontendDist: config.frontendDist, internalToken: config.internalToken });
const server = createServer(app);
let shuttingDown = false;

// Log streaming shares the HTTP server via the WebSocket upgrade path.
const allowedOrigins = (process.env.OPS_FLOW_ALLOWED_ORIGINS ?? `http://127.0.0.1:${config.port},http://localhost:${config.port},http://127.0.0.1:5173,http://localhost:5173`)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const logsWebSocket = attachLogsWebSocket(server, {
  policy: {
    allowedOrigins,
    capability: config.internalToken,
    requireCapability: Boolean(config.internalToken),
  },
  isShuttingDown: () => shuttingDown,
});

const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const client of logsWebSocket.clients) client.terminate();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

/**
 * A leftover backend holding the port is the most common local hiccup. Report it
 * plainly instead of letting Node print an unhandled EADDRINUSE stack trace.
 */
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${config.port} is already in use — there is probably another ops-union running.\n` +
        `Stop the previous process or use another port: OPS_FLOW_PORT=4001 npm run dev\n`,
    );
    process.exit(1);
  }
  console.error(`Failed to start the server: ${err.message}`);
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  console.log(`ops-union backend (read-only) listening on http://${config.host}:${config.port}`);
});
