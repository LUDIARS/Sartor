import type { Garment, GarmentKind, Gender } from "../domain/types.js";
import type { SartorDatabase } from "./db.js";

type SqlRow = Record<string, unknown>;

export interface GarmentSearch {
  readonly gender?: Gender;
  readonly genders?: readonly Gender[];
  readonly kind?: GarmentKind;
  readonly kinds?: readonly GarmentKind[];
  readonly maxPriceJpy?: number;
  readonly limit?: number;
}

function requiredString(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Invalid garment row: ${column} must be a string.`);
  }
  return value;
}

function nullableString(row: SqlRow, column: string): string | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid garment row: ${column} must be a string or null.`);
  }
  return value;
}

function requiredInteger(row: SqlRow, column: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid garment row: ${column} must be an integer.`);
  }
  return value;
}

function parseStringArray(row: SqlRow, column: string): string[] {
  const value = JSON.parse(requiredString(row, column)) as unknown;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid garment row: ${column} must contain a JSON string array.`);
  }
  return value;
}

function nullableBoolean(row: SqlRow, column: string): boolean | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (value === 0) {
    return false;
  }
  if (value === 1) {
    return true;
  }
  throw new Error(`Invalid garment row: ${column} must be 0, 1, or null.`);
}

function nullableColorRisk(row: SqlRow): Garment["colorBleedRisk"] {
  const risk = nullableString(row, "color_bleed_risk");
  if (risk === null || risk === "low" || risk === "mid" || risk === "high") {
    return risk;
  }
  throw new Error("Invalid garment row: color_bleed_risk is invalid.");
}

export function garmentFromRow(row: SqlRow): Garment {
  const gender = requiredString(row, "gender");
  if (gender !== "WOMEN" && gender !== "MEN" && gender !== "UNISEX") {
    throw new Error("Invalid garment row: gender is invalid.");
  }
  const kind = requiredString(row, "kind");
  if (!(["tops", "bottoms", "outer", "onepiece", "shoes", "accessory", "inner", "other"] as const).includes(kind as GarmentKind)) {
    throw new Error("Invalid garment row: kind is invalid.");
  }

  return {
    id: requiredString(row, "id"),
    brand: requiredString(row, "brand"),
    productId: requiredString(row, "product_id"),
    priceGroup: requiredString(row, "price_group"),
    name: requiredString(row, "name"),
    gender,
    kind: kind as GarmentKind,
    priceJpy: requiredInteger(row, "price_jpy"),
    currency: requiredString(row, "currency"),
    colors: parseStringArray(row, "colors_json"),
    sizes: parseStringArray(row, "sizes_json"),
    composition: nullableString(row, "composition"),
    washingInformation: nullableString(row, "washing_info"),
    dryerOk: nullableBoolean(row, "dryer_ok"),
    colorBleedRisk: nullableColorRisk(row),
    careReasons: parseStringArray(row, "care_reasons_json"),
    imageUrl: nullableString(row, "image_url"),
    productUrl: requiredString(row, "product_url"),
    rawJson: requiredString(row, "raw_json"),
    crawledAt: requiredString(row, "crawled_at"),
  };
}

export class GarmentRepository {
  public constructor(private readonly database: SartorDatabase) {}

  public upsert(garment: Garment): void {
    this.database.prepare(`
      INSERT INTO garments (
        id, brand, product_id, price_group, name, gender, kind, price_jpy, currency,
        colors_json, sizes_json, composition, washing_info, dryer_ok, color_bleed_risk,
        care_reasons_json, image_url, product_url, raw_json, crawled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        gender = excluded.gender,
        kind = excluded.kind,
        price_jpy = excluded.price_jpy,
        currency = excluded.currency,
        colors_json = excluded.colors_json,
        sizes_json = excluded.sizes_json,
        composition = excluded.composition,
        washing_info = excluded.washing_info,
        dryer_ok = excluded.dryer_ok,
        color_bleed_risk = excluded.color_bleed_risk,
        care_reasons_json = excluded.care_reasons_json,
        image_url = excluded.image_url,
        product_url = excluded.product_url,
        raw_json = excluded.raw_json,
        crawled_at = excluded.crawled_at
    `).run(
      garment.id,
      garment.brand,
      garment.productId,
      garment.priceGroup,
      garment.name,
      garment.gender,
      garment.kind,
      garment.priceJpy,
      garment.currency,
      JSON.stringify(garment.colors),
      JSON.stringify(garment.sizes),
      garment.composition,
      garment.washingInformation,
      garment.dryerOk === null ? null : Number(garment.dryerOk),
      garment.colorBleedRisk,
      JSON.stringify(garment.careReasons),
      garment.imageUrl,
      garment.productUrl,
      garment.rawJson,
      garment.crawledAt,
    );
  }

  public search(search: GarmentSearch = {}): Garment[] {
    const clauses: string[] = [];
    const parameters: Array<number | string> = [];
    if (search.gender !== undefined) {
      clauses.push("gender = ?");
      parameters.push(search.gender);
    }
    if (search.genders !== undefined && search.genders.length > 0) {
      clauses.push(`gender IN (${search.genders.map(() => "?").join(", ")})`);
      parameters.push(...search.genders);
    }
    if (search.kind !== undefined) {
      clauses.push("kind = ?");
      parameters.push(search.kind);
    }
    if (search.kinds !== undefined && search.kinds.length > 0) {
      clauses.push(`kind IN (${search.kinds.map(() => "?").join(", ")})`);
      parameters.push(...search.kinds);
    }
    if (search.maxPriceJpy !== undefined) {
      clauses.push("price_jpy <= ?");
      parameters.push(search.maxPriceJpy);
    }
    const where = clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`;
    const limitClause = search.limit === undefined ? "" : " LIMIT ?";
    if (search.limit !== undefined) {
      parameters.push(search.limit);
    }
    const rows = this.database.prepare(`SELECT * FROM garments ${where} ORDER BY price_jpy ASC, id ASC${limitClause}`).all(...parameters) as SqlRow[];
    return rows.map(garmentFromRow);
  }

  public findByIds(ids: readonly string[]): Garment[] {
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.database.prepare(`SELECT * FROM garments WHERE id IN (${placeholders})`).all(...ids) as SqlRow[];
    const garmentsById = new Map(rows.map((row) => {
      const garment = garmentFromRow(row);
      return [garment.id, garment] as const;
    }));
    return ids.flatMap((id) => {
      const garment = garmentsById.get(id);
      return garment === undefined ? [] : [garment];
    });
  }
}
