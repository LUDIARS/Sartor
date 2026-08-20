import type { GarmentSubKind, Gender } from "../domain/types.js";
import type { SartorDatabase } from "./db.js";

export interface AmazonProgressTarget {
  readonly gender: Gender;
  readonly classArgument: string;
  readonly query: string;
  readonly subKind?: GarmentSubKind;
}

export interface AmazonQueryProgress {
  readonly nextPage: number;
  readonly upserted: number;
  /** 検索結果の末尾まで到達済み。limit 到達だけでは true にしない。 */
  readonly completed: boolean;
  readonly processedAsins: readonly string[];
}

function requiredInteger(row: Record<string, unknown>, column: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid amazon_crawl_progress row: ${column} must be an integer.`);
  }
  return value;
}

/** @implements SPEC-STEP1C §4 — 永続化したページ内チェックポイントは ASIN 配列だけを受理する。 */
function processedAsinsFrom(row: Record<string, unknown>): string[] {
  const serialized = row["processed_asins_json"];
  if (typeof serialized !== "string") {
    throw new Error("Invalid amazon_crawl_progress row: processed_asins_json must be a string.");
  }
  const value = JSON.parse(serialized) as unknown;
  if (!Array.isArray(value) || value.some((asin) => typeof asin !== "string" || !/^[A-Z0-9]{10}$/u.test(asin))) {
    throw new Error("Invalid amazon_crawl_progress row: processed_asins_json must contain Amazon ASINs.");
  }
  return value;
}

/** @implements SPEC-STEP1C §4 — 同じ検索語でも性別・クラス・細分類が異なる進捗は混同しない。 */
function progressKeyFor(target: AmazonProgressTarget): string {
  return JSON.stringify([
    target.query.trim(),
    target.gender,
    target.classArgument.trim().toLowerCase(),
    target.subKind ?? null,
  ]);
}

/** @implements SPEC-STEP1C §4 — 対象別の進捗と処理済み ASIN を残し、中断した preset を正確に再開する。 */
export class AmazonProgressRepository {
  public constructor(private readonly database: SartorDatabase) {}

  public find(target: AmazonProgressTarget): AmazonQueryProgress | undefined {
    const row = this.database
      .prepare("SELECT next_page, upserted, completed, processed_asins_json FROM amazon_crawl_progress WHERE query = ?")
      .get(progressKeyFor(target)) as Record<string, unknown> | undefined;
    if (row === undefined) {
      return undefined;
    }
    const nextPage = requiredInteger(row, "next_page");
    const upserted = requiredInteger(row, "upserted");
    const completed = requiredInteger(row, "completed");
    if (nextPage < 1 || upserted < 0 || (completed !== 0 && completed !== 1)) {
      throw new Error("Invalid amazon_crawl_progress row: progress values are out of range.");
    }
    return {
      nextPage,
      upserted,
      completed: completed === 1,
      processedAsins: processedAsinsFrom(row),
    };
  }

  public save(target: AmazonProgressTarget, progress: AmazonQueryProgress, now: string): void {
    this.database.prepare(`
      INSERT INTO amazon_crawl_progress (query, next_page, upserted, completed, processed_asins_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(query) DO UPDATE SET
        next_page = excluded.next_page,
        upserted = excluded.upserted,
        completed = excluded.completed,
        processed_asins_json = excluded.processed_asins_json,
        updated_at = excluded.updated_at
    `).run(
      progressKeyFor(target),
      progress.nextPage,
      progress.upserted,
      Number(progress.completed),
      JSON.stringify(progress.processedAsins),
      now,
    );
  }

  public reset(target: AmazonProgressTarget): void {
    this.database.prepare("DELETE FROM amazon_crawl_progress WHERE query = ?").run(progressKeyFor(target));
  }
}
