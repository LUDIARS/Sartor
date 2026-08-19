import type { IncomingMessage, ServerResponse } from "node:http";

import {
  ageBandVocabulary,
  colorToneVocabulary,
  seasonVocabulary,
  styleAxisVocabulary,
  styleDefaultsByAgeAndTpo,
  tpoVocabulary,
} from "../../domain/fashion-vectors.js";
import { writeJson } from "../http.js";

export function handleVectorsRoute(_request: IncomingMessage, response: ServerResponse): void {
  writeJson(response, 200, {
    ageBands: ageBandVocabulary,
    tpos: tpoVocabulary,
    styleAxes: styleAxisVocabulary,
    seasons: seasonVocabulary,
    colorTones: colorToneVocabulary,
    defaults: styleDefaultsByAgeAndTpo,
  });
}
