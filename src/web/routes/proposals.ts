import type { IncomingMessage, ServerResponse } from "node:http";

import { budgetDifferenceJpy, isWithinBudget, totalPriceJpy } from "../../domain/budget.js";
import {
  decisionInputSchema,
  proposalRequestSchema,
  type OutfitOption,
} from "../../domain/types.js";
import { selectCandidateGarments } from "../../llm/candidate-selector.js";
import { OutfitProposer, outfitProposalModel } from "../../llm/outfit-proposer.js";
import { HttpError, parseRequest, readJsonBody, writeJson } from "../http.js";
import type { ApiContext } from "./context.js";

function careCautions(items: OutfitOption["items"]): string[] {
  const cautions: string[] = [];
  for (const item of items) {
    if (item.garment.dryerOk === false) {
      cautions.push(`${item.garment.name}: 乾燥機不可`);
    }
    if (item.garment.colorBleedRisk === "high") {
      cautions.push(`${item.garment.name}: 色落ち注意`);
    }
  }
  return cautions;
}

export async function handleProposalsRoute(request: IncomingMessage, response: ServerResponse, context: ApiContext, pathname: string): Promise<void> {
  if (pathname === "/api/proposals") {
    await handleCollection(request, response, context);
    return;
  }
  const decisionMatch = pathname.match(/^\/api\/proposals\/(\d+)\/decision$/u);
  if (decisionMatch !== null) {
    await handleDecision(request, response, context, Number(decisionMatch[1]));
    return;
  }
  const detailMatch = pathname.match(/^\/api\/proposals\/(\d+)$/u);
  if (detailMatch !== null) {
    handleDetail(request, response, context, Number(detailMatch[1]));
    return;
  }
  throw new HttpError(404, "not_found", "Proposal endpoint was not found.");
}

async function handleCollection(request: IncomingMessage, response: ServerResponse, context: ApiContext): Promise<void> {
  if (request.method === "GET") {
    writeJson(response, 200, { proposals: context.proposals.list() });
    return;
  }
  if (request.method !== "POST") {
    throw new HttpError(405, "method_not_allowed", "Method is not allowed for /api/proposals.");
  }
  const input = parseRequest(proposalRequestSchema, await readJsonBody(request));
  const profile = context.profiles.get();
  if (profile === null) {
    throw new HttpError(409, "profile_required", "Save a profile before requesting an outfit proposal.");
  }
  if (profile.topSize === null || profile.bottomSize === null) {
    throw new HttpError(409, "profile_size_update_required", "Re-save the profile with supported Japanese sizes before requesting a proposal.");
  }
  const candidateGenders = profile.gender === "UNISEX" ? undefined : [profile.gender, "UNISEX"] as const;
  const candidates = selectCandidateGarments(
    context.garments.search({
      genders: candidateGenders,
      kinds: input.kinds,
      maxPriceJpy: input.budgetJpy,
    }),
    profile,
    input.kinds,
    input.budgetJpy,
  );
  if (candidates.length === 0) {
    throw new HttpError(422, "no_candidates", "No catalog items meet the selected profile and budget constraints.");
  }

  const generated = await new OutfitProposer().propose({
    profile,
    vector: input.vector,
    budgetJpy: input.budgetJpy,
    kinds: input.kinds,
    candidates,
  });
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const options: OutfitOption[] = generated.options.map((generatedOption, optionIndex) => {
    const items = generatedOption.items.map((generatedItem) => {
      const garment = candidatesById.get(generatedItem.garmentId);
      if (garment === undefined) {
        throw new Error(`Validated candidate ${generatedItem.garmentId} was not available.`);
      }
      return {
        garmentId: garment.id,
        role: generatedItem.role,
        reason: generatedOption.rationale,
        garment,
      };
    });
    const totalJpy = totalPriceJpy(items.map((item) => item.garment));
    const option: OutfitOption = {
      optionIndex,
      items,
      totalJpy,
      overBudget: !isWithinBudget(totalJpy, input.budgetJpy),
      rationale: generatedOption.rationale,
      cautions: [...new Set([...generatedOption.cautions, ...careCautions(items)])],
    };
    return option;
  });
  const proposalId = context.proposals.create({
    profileId: profile.id,
    vector: input.vector,
    budgetJpy: input.budgetJpy,
    kinds: input.kinds,
    model: outfitProposalModel,
    options,
  });
  writeJson(response, 201, {
    proposalId,
    options: options.map((option) => ({ ...option, budgetDifferenceJpy: budgetDifferenceJpy(option.totalJpy, input.budgetJpy) })),
  });
}

function handleDetail(request: IncomingMessage, response: ServerResponse, context: ApiContext, proposalId: number): void {
  if (request.method !== "GET") {
    throw new HttpError(405, "method_not_allowed", "Method is not allowed for a proposal detail.");
  }
  const proposal = context.proposals.findById(proposalId);
  if (proposal === null) {
    throw new HttpError(404, "proposal_not_found", "Proposal was not found.");
  }
  writeJson(response, 200, { proposal });
}

async function handleDecision(request: IncomingMessage, response: ServerResponse, context: ApiContext, proposalId: number): Promise<void> {
  if (request.method !== "POST") {
    throw new HttpError(405, "method_not_allowed", "Method is not allowed for a proposal decision.");
  }
  const input = parseRequest(decisionInputSchema, await readJsonBody(request));
  const proposal = context.proposals.findById(proposalId);
  if (proposal === null) {
    throw new HttpError(404, "proposal_not_found", "Proposal was not found.");
  }
  if (!proposal.options.some((option) => option.optionIndex === input.optionIndex)) {
    throw new HttpError(400, "invalid_option_index", "Option index does not exist for this proposal.");
  }
  const decision = context.proposals.saveDecision(proposalId, input);
  writeJson(response, 200, { proposalId, optionIndex: input.optionIndex, decision });
}
