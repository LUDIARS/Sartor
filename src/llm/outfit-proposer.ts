import type { FashionVector, Garment, GarmentKind, Profile, Season } from "../domain/types.js";

import {
  createClaudeCliRunner,
  resolveClaudeCliModel,
  type ClaudeCliRunner,
} from "./claude-cli-runner.js";
import { InvalidLlmProposalError, parseLlmProposal, type LlmProposal } from "./proposal-parser.js";
import { buildOutfitSystemPrompt, buildOutfitUserPrompt } from "./prompt.js";

export type { LlmProposal } from "./proposal-parser.js";
export { InvalidLlmProposalError } from "./proposal-parser.js";

export interface OutfitProposalInput {
  readonly profile: Profile;
  readonly vector: FashionVector;
  readonly budgetJpy: number;
  readonly kinds: readonly GarmentKind[];
  readonly season: Season;
  readonly candidates: readonly Garment[];
}

export interface OutfitProposerOptions {
  readonly runner?: ClaudeCliRunner;
  readonly model?: string;
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

/** カタログ候補だけを使う三案のコーディネート提案を Claude CLI に依頼する。 */
export class OutfitProposer {
  private readonly runner: ClaudeCliRunner;

  public constructor(options: OutfitProposerOptions = {}) {
    const model = resolveClaudeCliModel(options.model);
    this.runner = options.runner ?? createClaudeCliRunner({ model });
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
    const systemPrompt = buildOutfitSystemPrompt();
    const userPrompt = buildOutfitUserPrompt(
      input.profile,
      input.vector,
      input.budgetJpy,
      input.kinds,
      input.season,
      input.candidates,
      correction,
    );
    const output = await this.runner.complete(`# System\n${systemPrompt}\n\n# User\n${userPrompt}`);
    return parseLlmProposal(output);
  }
}

export const outfitProposalModel = resolveClaudeCliModel();
