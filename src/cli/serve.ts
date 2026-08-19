import { logError, logInfo } from "../log.js";
import { createSartorServer } from "../web/server.js";

const DEFAULT_PORT = 3000;
const LOOPBACK_HOST = "127.0.0.1";

function resolvePort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_PORT;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

async function main(): Promise<void> {
  const port = resolvePort(process.env.PORT);
  const application = createSartorServer();
  const close = async (signal: string): Promise<void> => {
    try {
      await application.close();
      logInfo("sartor_server_stopped", { signal });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server shutdown failure.";
      logError("sartor_server_stop_failed", { message, signal });
      process.exitCode = 1;
    }
  };
  application.server.once("error", (error: Error) => {
    logError("sartor_server_failed", { message: error.message });
    process.exitCode = 1;
    void close("server_error");
  });
  application.server.listen(port, LOOPBACK_HOST, () => {
    logInfo("sartor_server_started", { host: LOOPBACK_HOST, port });
  });

  process.once("SIGINT", () => { void close("SIGINT"); });
  process.once("SIGTERM", () => { void close("SIGTERM"); });
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown server startup failure.";
  logError("sartor_server_failed", { message });
  process.exitCode = 1;
});
