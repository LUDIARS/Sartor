import type { IncomingMessage, ServerResponse } from "node:http";
import type { ZodType } from "zod";

const MAXIMUM_JSON_BODY_BYTES = 1_000_000;

/** @implements SPEC-STEP1-PROTOTYPE §8 — API エラーは `{ error: { code, message } }` JSON で返す。 */
export class HttpError extends Error {
  public constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function parseRequest<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "validation_error", "Request did not match the required format.");
  }
  return result.data;
}

/** @implements SPEC-STEP1-PROTOTYPE §8 — JSON body を読み、壊れていれば 400 (fail-fast)。 */
export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const mediaType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new HttpError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }
  const chunks: Buffer[] = [];
  let totalLength = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalLength += buffer.length;
    if (totalLength > MAXIMUM_JSON_BODY_BYTES) {
      throw new HttpError(413, "body_too_large", "JSON request body is too large.");
    }
    chunks.push(buffer);
  }
  if (totalLength === 0) {
    throw new HttpError(400, "invalid_json", "A JSON request body is required.");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

/** @implements SPEC-STEP1-PROTOTYPE §8 — JSON 応答の単一出口。 */
export function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

/** @implements SPEC-STEP1-PROTOTYPE §8 — `{ error: { code, message } }` 形式のエラー応答。秘密情報は載せない。 */
export function writeHttpError(response: ServerResponse, error: HttpError): void {
  writeJson(response, error.statusCode, { error: { code: error.code, message: error.message } });
}
