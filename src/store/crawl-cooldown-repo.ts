import type { SartorDatabase } from "./db.js";

export interface CrawlCooldown {
  readonly scope: string;
  readonly blockedUntil: string;
  readonly reason: string;
}

/** @implements SPEC-STEP1C §4 — CAPTCHA を踏んだ事実を実行を跨いで残し、期間内の再開を止める。 */
export class CrawlCooldownRepository {
  public constructor(private readonly database: SartorDatabase) {}

  public find(scope: string): CrawlCooldown | undefined {
    const row = this.database
      .prepare("SELECT scope, blocked_until, reason FROM crawl_cooldowns WHERE scope = ?")
      .get(scope) as Record<string, unknown> | undefined;
    if (row === undefined) {
      return undefined;
    }
    const blockedUntil = row["blocked_until"];
    const reason = row["reason"];
    if (typeof blockedUntil !== "string" || typeof reason !== "string") {
      throw new Error("Invalid crawl_cooldowns row: blocked_until and reason must be strings.");
    }
    return { scope, blockedUntil, reason };
  }

  public block(scope: string, blockedUntil: string, reason: string, now: string): void {
    this.database.prepare(`
      INSERT INTO crawl_cooldowns (scope, blocked_until, reason, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET
        blocked_until = excluded.blocked_until,
        reason = excluded.reason,
        updated_at = excluded.updated_at
    `).run(scope, blockedUntil, reason, now);
  }

  public clear(scope: string): void {
    this.database.prepare("DELETE FROM crawl_cooldowns WHERE scope = ?").run(scope);
  }
}
