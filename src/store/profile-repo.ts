import { normalizeSizeLabel, type JapaneseSize } from "../domain/size.js";
import type { Profile, ProfileInput } from "../domain/types.js";
import type { SartorDatabase } from "./db.js";

type SqlRow = Record<string, unknown>;

function nullableText(row: SqlRow, column: string): string | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid profile row: ${column} must be a string or null.`);
  }
  return value;
}

function requiredText(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Invalid profile row: ${column} must be a string.`);
  }
  return value;
}

function nullableInteger(row: SqlRow, column: string): number | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid profile row: ${column} must be an integer or null.`);
  }
  return value;
}

function requiredInteger(row: SqlRow, column: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid profile row: ${column} must be an integer.`);
  }
  return value;
}

function readBoolean(row: SqlRow, column: string): boolean {
  const value = requiredInteger(row, column);
  if (value !== 0 && value !== 1) {
    throw new Error(`Invalid profile row: ${column} must be 0 or 1.`);
  }
  return value === 1;
}

function readStringArray(row: SqlRow, column: string): string[] {
  const parsed = JSON.parse(requiredText(row, column)) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid profile row: ${column} must contain a JSON string array.`);
  }
  return parsed;
}

/** @implements SPEC-STEP1-PROTOTYPE §11 — aliases are normalized; unsupported legacy values require reselection without breaking profile reads. */
function readJapaneseSize(row: SqlRow, column: string): JapaneseSize | null {
  const raw = requiredText(row, column);
  return normalizeSizeLabel(raw) ?? null;
}

function profileFromRow(row: SqlRow): Profile {
  const gender = requiredText(row, "gender");
  const ageBand = requiredText(row, "age_band");
  if (gender !== "WOMEN" && gender !== "MEN" && gender !== "UNISEX") {
    throw new Error("Invalid profile row: gender is invalid.");
  }
  if (!(["10s", "20s", "30s", "40s", "50s", "60s+"] as const).includes(ageBand as Profile["ageBand"])) {
    throw new Error("Invalid profile row: age_band is invalid.");
  }
  return {
    id: 1,
    displayName: nullableText(row, "display_name"),
    gender,
    ageBand: ageBand as Profile["ageBand"],
    heightCm: nullableInteger(row, "height_cm"),
    weightKg: nullableInteger(row, "weight_kg"),
    topSize: readJapaneseSize(row, "top_size"),
    bottomSize: readJapaneseSize(row, "bottom_size"),
    bodyNotes: nullableText(row, "body_notes"),
    favColors: readStringArray(row, "fav_colors_json"),
    avoidColors: readStringArray(row, "avoid_colors_json"),
    ngMaterials: readStringArray(row, "ng_materials_json"),
    usesDryer: readBoolean(row, "uses_dryer"),
    avoidColorBleed: readBoolean(row, "avoid_color_bleed"),
    monthlyBudgetJpy: requiredInteger(row, "monthly_budget_jpy"),
    updatedAt: requiredText(row, "updated_at"),
  };
}

export class ProfileRepository {
  public constructor(private readonly database: SartorDatabase) {}

  public get(): Profile | null {
    const row = this.database.prepare("SELECT * FROM profiles WHERE id = 1").get() as SqlRow | undefined;
    return row === undefined ? null : profileFromRow(row);
  }

  public save(input: ProfileInput): Profile {
    const updatedAt = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO profiles (
        id, display_name, gender, age_band, height_cm, weight_kg, top_size, bottom_size, body_notes,
        fav_colors_json, avoid_colors_json, ng_materials_json, uses_dryer, avoid_color_bleed,
        monthly_budget_jpy, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        gender = excluded.gender,
        age_band = excluded.age_band,
        height_cm = excluded.height_cm,
        weight_kg = excluded.weight_kg,
        top_size = excluded.top_size,
        bottom_size = excluded.bottom_size,
        body_notes = excluded.body_notes,
        fav_colors_json = excluded.fav_colors_json,
        avoid_colors_json = excluded.avoid_colors_json,
        ng_materials_json = excluded.ng_materials_json,
        uses_dryer = excluded.uses_dryer,
        avoid_color_bleed = excluded.avoid_color_bleed,
        monthly_budget_jpy = excluded.monthly_budget_jpy,
        updated_at = excluded.updated_at
    `).run(
      input.displayName ?? null,
      input.gender,
      input.ageBand,
      input.heightCm ?? null,
      input.weightKg ?? null,
      input.topSize,
      input.bottomSize,
      input.bodyNotes ?? null,
      JSON.stringify(input.favColors),
      JSON.stringify(input.avoidColors),
      JSON.stringify(input.ngMaterials),
      Number(input.usesDryer),
      Number(input.avoidColorBleed),
      input.monthlyBudgetJpy,
      updatedAt,
    );
    const profile = this.get();
    if (profile === null) {
      throw new Error("Profile was not persisted.");
    }
    return profile;
  }
}
