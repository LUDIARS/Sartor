import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import { garmentKindSchema, genderSchema } from "../../domain/types.js";
import { HttpError, parseRequest, writeJson } from "../http.js";
import type { ApiContext } from "./context.js";

const garmentQuerySchema = z.object({
  gender: genderSchema.optional(),
  kind: garmentKindSchema.optional(),
  maxPrice: z.coerce.number().int().positive().max(10_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

export function handleGarmentsRoute(request: IncomingMessage, response: ServerResponse, context: ApiContext, url: URL): void {
  if (request.method !== "GET") {
    throw new HttpError(405, "method_not_allowed", "Method is not allowed for /api/garments.");
  }
  const query = parseRequest(garmentQuerySchema, {
    gender: url.searchParams.get("gender") ?? undefined,
    kind: url.searchParams.get("kind") ?? undefined,
    maxPrice: url.searchParams.get("maxPrice") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  const garments = context.garments.search({
    gender: query.gender,
    kind: query.kind,
    maxPriceJpy: query.maxPrice,
    limit: query.limit,
  });
  writeJson(response, 200, { garments });
}
