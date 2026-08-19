import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { FashionVector, Garment, GarmentKind, Profile } from "../domain/types.js";
import { buildOutfitSystemPrompt, buildOutfitUserPrompt } from "./prompt.js";

const MODEL = "claude-opus-5";
const MAX_TOKENS = 16_000;

const llmOptionSchema = z.object({
  items: z.array(z.object({
    garmentId: z.string().min(1),
    role: z.string().trim().min(1).max(100),
  })).min(1),
  rationale: z.string().trim().min(1).max(3_000),
  cautions: z.array(z.string().trim().min(1).max(1_000)),
});

const llmProposalSchema = z.object({
  options: z.array(llmOptionSchema).length(3),
});

export type LlmProposal = z.infer<typeof llmProposalSchema>;

export interface OutfitProposalInput {
  readonly profile: Profile;
  readonly vector: FashionVector;
  readonly budgetJpy: number;
  readonly kinds: readonly GarmentKind[];
  readonly candidates: readonly Garment[];
}

export class LlmNotConfiguredError extends Error {
  public constructor() {
    super("ANTHROPIC_API_KEY is required to generate outfit proposals.");
    this.name = "LlmNotConfiguredError";
  }
}

export class InvalidLlmProposalError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidLlmProposalError";
  }
}

function validateCandidateReferences(proposal: LlmProposal, candidates: readonly Garment[]): string | undefined {
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  for (const [optionIndex, option] of proposal.options.entries()) {
    const selectedIds = new Set<string>();
    for (const item of option.items) {
      if (!candidateIds.has(item.garmentId)) {
        return `Option ${optionIndex + 1} referenced a garment outside the candidate set.`;
      }
      if (selectedIds.has(item.garmentId)) {
        return `Option ${optionIndex + 1} referenced the same garment more than once.`;
      }
      selectedIds.add(item.garmentId);
    }
  }
  return undefined;
}

export class OutfitProposer {
  private readonly client: Anthropic;

  public constructor(apiKey: string | undefined = process.env.ANTHROPIC_API_KEY) {
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new LlmNotConfiguredError();
    }
    this.client = new Anthropic({ apiKey });
  }

  public async propose(input: OutfitProposalInput): Promise<LlmProposal> {
    const firstProposal = await this.requestProposal(input);
    const firstError = validateCandidateReferences(firstProposal, input.candidates);
    if (firstError === undefined) {
      return firstProposal;
    }

    const correctedProposal = await this.requestProposal(input, firstError);
    const correctedError = validateCandidateReferences(correctedProposal, input.candidates);
    if (correctedError !== undefined) {
      throw new InvalidLlmProposalError(correctedError);
    }
    return correctedProposal;
  }

  private async requestProposal(input: OutfitProposalInput, correction?: string): Promise<LlmProposal> {
    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildOutfitSystemPrompt(),
      messages: [{
        role: "user",
        content: buildOutfitUserPrompt(input.profile, input.vector, input.budgetJpy, input.kinds, input.candidates, correction),
      }],
      output_config: { format: zodOutputFormat(llmProposalSchema) },
    });
    if (response.parsed_output === null) {
      throw new InvalidLlmProposalError("The model returned no structured proposal.");
    }
    return response.parsed_output;
  }
}

export const outfitProposalModel = MODEL;
