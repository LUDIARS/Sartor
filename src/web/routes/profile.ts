import type { IncomingMessage, ServerResponse } from "node:http";

import { profileInputSchema } from "../../domain/types.js";
import { readJsonBody, HttpError, parseRequest, writeJson } from "../http.js";
import type { ApiContext } from "./context.js";

export async function handleProfileRoute(request: IncomingMessage, response: ServerResponse, context: ApiContext): Promise<void> {
  if (request.method === "GET") {
    writeJson(response, 200, { profile: context.profiles.get() });
    return;
  }
  if (request.method !== "PUT") {
    throw new HttpError(405, "method_not_allowed", "Method is not allowed for /api/profile.");
  }
  const input = parseRequest(profileInputSchema, await readJsonBody(request));
  writeJson(response, 200, { profile: context.profiles.save(input) });
}
