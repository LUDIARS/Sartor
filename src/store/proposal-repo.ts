import {
  fashionVectorSchema,
  type DecisionInput,
  type FashionVector,
  type GarmentKind,
  type OutfitOption,
  type ProposalDecision,
} from "../domain/types.js";
import type { SartorDatabase } from "./db.js";
import { GarmentRepository } from "./garment-repo.js";

type SqlRow = Record<string, unknown>;

export interface ProposalToSave {
  readonly profileId: 1;
  readonly vector: FashionVector;
  readonly budgetJpy: number;
  readonly kinds: readonly GarmentKind[];
  readonly model: string;
  readonly options: readonly OutfitOption[];
}

export interface StoredDecision {
  readonly decision: ProposalDecision;
  readonly note: string | null;
  readonly decidedAt: string;
}

export interface StoredProposal {
  readonly id: number;
  readonly profileId: number;
  readonly vector: FashionVector;
  readonly budgetJpy: number;
  readonly kinds: GarmentKind[];
  readonly model: string;
  readonly createdAt: string;
  readonly options: OutfitOption[];
  readonly decisions: Readonly<Record<number, StoredDecision>>;
}

export interface ProposalSummary {
  readonly id: number;
  readonly budgetJpy: number;
  readonly model: string;
  readonly createdAt: string;
  readonly decisions: Readonly<Record<number, StoredDecision>>;
}

function requiredInteger(row: SqlRow, column: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid proposal row: ${column} must be an integer.`);
  }
  return value;
}

function requiredText(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Invalid proposal row: ${column} must be a string.`);
  }
  return value;
}

function nullableText(row: SqlRow, column: string): string | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid proposal row: ${column} must be a string or null.`);
  }
  return value;
}

function parseVector(row: SqlRow): FashionVector {
  return fashionVectorSchema.parse(JSON.parse(requiredText(row, "vector_json")) as unknown);
}

function parseKinds(row: SqlRow): GarmentKind[] {
  const value = JSON.parse(requiredText(row, "kinds_json")) as unknown;
  const validKinds: readonly GarmentKind[] = ["tops", "bottoms", "outer", "onepiece", "shoes", "accessory", "inner", "other"];
  if (!Array.isArray(value) || value.some((kind) => typeof kind !== "string" || !validKinds.includes(kind as GarmentKind))) {
    throw new Error("Invalid proposal row: kinds_json is invalid.");
  }
  return value as GarmentKind[];
}

function parseCautions(row: SqlRow): string[] {
  const value = JSON.parse(requiredText(row, "cautions_json")) as unknown;
  if (!Array.isArray(value) || value.some((caution) => typeof caution !== "string")) {
    throw new Error("Invalid proposal row: cautions_json is invalid.");
  }
  return value;
}

function readDecision(row: SqlRow): StoredDecision {
  const decision = requiredText(row, "decision");
  if (decision !== "accept" && decision !== "hold" && decision !== "reject") {
    throw new Error("Invalid proposal row: decision is invalid.");
  }
  return {
    decision,
    note: nullableText(row, "note"),
    decidedAt: requiredText(row, "decided_at"),
  };
}

export class ProposalRepository {
  private readonly garments: GarmentRepository;

  public constructor(private readonly database: SartorDatabase) {
    this.garments = new GarmentRepository(database);
  }

  public create(proposal: ProposalToSave): number {
    const createdAt = new Date().toISOString();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.database.prepare(`
        INSERT INTO proposals (profile_id, vector_json, budget_jpy, kinds_json, model, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        proposal.profileId,
        JSON.stringify(proposal.vector),
        proposal.budgetJpy,
        JSON.stringify(proposal.kinds),
        proposal.model,
        createdAt,
      );
      const proposalId = Number(result.lastInsertRowid);
      for (const option of proposal.options) {
        this.database.prepare(`
          INSERT INTO proposal_options (proposal_id, option_index, total_jpy, over_budget, rationale, cautions_json)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          proposalId,
          option.optionIndex,
          option.totalJpy,
          Number(option.overBudget),
          option.rationale,
          JSON.stringify(option.cautions),
        );
        for (const item of option.items) {
          this.database.prepare(`
            INSERT INTO proposal_items (proposal_id, option_index, garment_id, role, reason)
            VALUES (?, ?, ?, ?, ?)
          `).run(proposalId, option.optionIndex, item.garmentId, item.role, item.reason);
        }
      }
      this.database.exec("COMMIT");
      return proposalId;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public findById(proposalId: number): StoredProposal | null {
    const proposalRow = this.database.prepare("SELECT * FROM proposals WHERE id = ?").get(proposalId) as SqlRow | undefined;
    if (proposalRow === undefined) {
      return null;
    }
    const optionRows = this.database.prepare(`
      SELECT * FROM proposal_options WHERE proposal_id = ? ORDER BY option_index ASC
    `).all(proposalId) as SqlRow[];
    const itemRows = this.database.prepare(`
      SELECT proposal_id, option_index, garment_id, role, reason
      FROM proposal_items WHERE proposal_id = ? ORDER BY option_index ASC, garment_id ASC
    `).all(proposalId) as SqlRow[];
    const garmentsById = new Map(this.garments.findByIds(itemRows.map((row) => requiredText(row, "garment_id"))).map((garment) => [garment.id, garment]));
    const options = optionRows.map((optionRow) => {
      const optionIndex = requiredInteger(optionRow, "option_index");
      const items = itemRows
        .filter((itemRow) => requiredInteger(itemRow, "option_index") === optionIndex)
        .map((itemRow) => {
          const garmentId = requiredText(itemRow, "garment_id");
          const garment = garmentsById.get(garmentId);
          if (garment === undefined) {
            throw new Error(`Proposal ${proposalId} references missing garment ${garmentId}.`);
          }
          return {
            garmentId,
            role: requiredText(itemRow, "role"),
            reason: requiredText(itemRow, "reason"),
            garment,
          };
        });
      const overBudget = requiredInteger(optionRow, "over_budget");
      if (overBudget !== 0 && overBudget !== 1) {
        throw new Error("Invalid proposal row: over_budget must be 0 or 1.");
      }
      return {
        optionIndex,
        items,
        totalJpy: requiredInteger(optionRow, "total_jpy"),
        overBudget: overBudget === 1,
        rationale: requiredText(optionRow, "rationale"),
        cautions: parseCautions(optionRow),
      };
    });
    return {
      id: requiredInteger(proposalRow, "id"),
      profileId: requiredInteger(proposalRow, "profile_id"),
      vector: parseVector(proposalRow),
      budgetJpy: requiredInteger(proposalRow, "budget_jpy"),
      kinds: parseKinds(proposalRow),
      model: requiredText(proposalRow, "model"),
      createdAt: requiredText(proposalRow, "created_at"),
      options,
      decisions: this.decisionsFor(proposalId),
    };
  }

  public list(): ProposalSummary[] {
    const rows = this.database.prepare(`
      SELECT id, budget_jpy, model, created_at FROM proposals ORDER BY created_at DESC, id DESC
    `).all() as SqlRow[];
    return rows.map((row) => {
      const id = requiredInteger(row, "id");
      return {
        id,
        budgetJpy: requiredInteger(row, "budget_jpy"),
        model: requiredText(row, "model"),
        createdAt: requiredText(row, "created_at"),
        decisions: this.decisionsFor(id),
      };
    });
  }

  public saveDecision(proposalId: number, input: DecisionInput): StoredDecision {
    const decidedAt = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO proposal_decisions (proposal_id, option_index, decision, note, decided_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(proposal_id, option_index) DO UPDATE SET
        decision = excluded.decision,
        note = excluded.note,
        decided_at = excluded.decided_at
    `).run(proposalId, input.optionIndex, input.decision, input.note ?? null, decidedAt);
    return { decision: input.decision, note: input.note ?? null, decidedAt };
  }

  private decisionsFor(proposalId: number): Readonly<Record<number, StoredDecision>> {
    const rows = this.database.prepare(`
      SELECT option_index, decision, note, decided_at FROM proposal_decisions WHERE proposal_id = ?
    `).all(proposalId) as SqlRow[];
    const decisions: Record<number, StoredDecision> = {};
    for (const row of rows) {
      decisions[requiredInteger(row, "option_index")] = readDecision(row);
    }
    return decisions;
  }
}
