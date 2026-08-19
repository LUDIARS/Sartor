import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ClaudeCliExecutionError } from "../llm/claude-cli-runner.js";
import { ClaudeCliUnavailableError } from "../llm/claude-cli-path.js";
import { InvalidLlmProposalError } from "../llm/proposal-parser.js";
import { logError } from "../log.js";
import { closeDatabase, openDatabase, type SartorDatabase } from "../store/db.js";
import { GarmentRepository } from "../store/garment-repo.js";
import { ProfileRepository } from "../store/profile-repo.js";
import { ProposalRepository } from "../store/proposal-repo.js";
import { HttpError, writeHttpError, writeJson } from "./http.js";
import { handleGarmentsRoute } from "./routes/garments.js";
import { handleProfileRoute } from "./routes/profile.js";
import { handleProposalsRoute } from "./routes/proposals.js";
import type { ApiContext } from "./routes/context.js";
import { handleVectorsRoute } from "./routes/vectors.js";

const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
const publicAssets = new Map<string, { fileName: string; contentType: string }>([
  ["/", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/index.html", { fileName: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { fileName: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/style.css", { fileName: "style.css", contentType: "text/css; charset=utf-8" }],
]);
const localRequestHostnames: readonly string[] = ["localhost", "127.0.0.1"];

/**
 * LUDIARS_ALLOWED_HOSTS (Excubitor では sartor${DOMAIN_ROOT} を設定、カンマ区切り) を許可に足す。
 * 先頭が "." の項目はサフィックス一致 (例: .example.com → sartor.example.com)、他は完全一致。
 */
function configuredAllowedHosts(): readonly string[] {
  return (process.env.LUDIARS_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function hostnameIsAllowed(hostname: string): boolean {
  if (localRequestHostnames.includes(hostname)) {
    return true;
  }
  return configuredAllowedHosts().some((entry) =>
    entry.startsWith(".") ? hostname.endsWith(entry) || hostname === entry.slice(1) : hostname === entry,
  );
}
const publicSecurityHeaders = {
  "content-security-policy": "default-src 'self'; img-src https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
} as const;

export interface SartorServer {
  readonly server: Server;
  close(): Promise<void>;
}

function createApiContext(database: SartorDatabase): ApiContext {
  return {
    garments: new GarmentRepository(database),
    profiles: new ProfileRepository(database),
    proposals: new ProposalRepository(database),
  };
}

function runningVersion(): string {
  return process.env.EXCUBITOR_SERVICE_VERSION ?? process.env.SARTOR_SERVICE_VERSION ?? process.env.npm_package_version ?? "unknown";
}

function errorFor(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof ClaudeCliUnavailableError) {
    return new HttpError(501, "llm_unavailable", "Install and log in to the local Claude Code CLI before requesting proposals.");
  }
  if (error instanceof InvalidLlmProposalError) {
    return new HttpError(502, "invalid_llm_proposal", "Claude CLI returned an invalid outfit proposal.");
  }
  if (error instanceof ClaudeCliExecutionError) {
    return new HttpError(502, "llm_execution_failed", "Claude CLI could not complete the outfit proposal.");
  }
  return new HttpError(500, "internal_error", "An unexpected server error occurred.");
}

function validateLocalRequestHost(request: IncomingMessage): void {
  const host = request.headers.host;
  if (host === undefined) {
    throw new HttpError(400, "invalid_host", "A valid local Host header is required.");
  }
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    throw new HttpError(400, "invalid_host", "A valid local Host header is required.");
  }
  if (!hostnameIsAllowed(hostname)) {
    throw new HttpError(403, "invalid_host", "The request Host is not in the allowed host list.");
  }
}

async function sendPublicAsset(response: ServerResponse, pathname: string): Promise<boolean> {
  const asset = publicAssets.get(pathname);
  if (asset === undefined) {
    return false;
  }
  const content = await readFile(join(publicDirectory, asset.fileName));
  response.writeHead(200, {
    "content-type": asset.contentType,
    "content-length": content.byteLength,
    "cache-control": "no-store",
    ...publicSecurityHeaders,
  });
  response.end(content);
  return true;
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, context: ApiContext): Promise<void> {
  validateLocalRequestHost(request);
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  const { pathname } = requestUrl;
  if (request.method === "GET" && pathname === "/api/health") {
    writeJson(response, 200, { ok: true, service: "sartor", version: runningVersion() });
    return;
  }
  if (pathname === "/api/profile") {
    await handleProfileRoute(request, response, context);
    return;
  }
  if (pathname === "/api/vectors") {
    if (request.method !== "GET") {
      throw new HttpError(405, "method_not_allowed", "Method is not allowed for /api/vectors.");
    }
    handleVectorsRoute(request, response);
    return;
  }
  if (pathname === "/api/garments") {
    handleGarmentsRoute(request, response, context, requestUrl);
    return;
  }
  if (pathname === "/api/proposals" || pathname.startsWith("/api/proposals/")) {
    await handleProposalsRoute(request, response, context, pathname);
    return;
  }
  if (pathname.startsWith("/api/")) {
    throw new HttpError(404, "not_found", "API endpoint was not found.");
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(405, "method_not_allowed", "Method is not allowed for static content.");
  }
  if (request.method === "HEAD") {
    const asset = publicAssets.get(pathname);
    if (asset === undefined) {
      throw new HttpError(404, "not_found", "Page was not found.");
    }
    response.writeHead(200, { "content-type": asset.contentType, "cache-control": "no-store", ...publicSecurityHeaders });
    response.end();
    return;
  }
  if (!await sendPublicAsset(response, pathname)) {
    throw new HttpError(404, "not_found", "Page was not found.");
  }
}

export function createSartorServer(database = openDatabase()): SartorServer {
  const context = createApiContext(database);
  const server = createServer((request, response) => {
    void handleRequest(request, response, context).catch((error: unknown) => {
      const responseError = errorFor(error);
      logError("http_request_failed", {
        code: responseError.code,
        errorName: error instanceof Error ? error.name : "UnknownError",
        method: request.method ?? null,
        pathname: request.url?.split("?", 1)[0] ?? null,
      });
      if (!response.headersSent) {
        writeHttpError(response, responseError);
      } else {
        response.end();
      }
    });
  });
  let closePromise: Promise<void> | undefined;
  return {
    server,
    close: (): Promise<void> => {
      closePromise ??= (async (): Promise<void> => {
        try {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error === undefined || (error as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") {
                resolve();
                return;
              }
              reject(error);
            });
          });
        } finally {
          closeDatabase(database);
        }
      })();
      return closePromise;
    },
  };
}
