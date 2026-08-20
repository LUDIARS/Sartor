import type { CrawlCooldownRepository } from "../../store/crawl-cooldown-repo.js";

export const AMAZON_COOLDOWN_SCOPE = "amazon";
const DEFAULT_COOLDOWN_HOURS = 6;
const MILLISECONDS_PER_HOUR = 3_600_000;

export class AmazonCooldownError extends Error {
  public constructor(readonly blockedUntil: string, readonly reason: string) {
    super(`Amazon crawling is on cooldown until ${blockedUntil} (${reason}).`);
    this.name = "AmazonCooldownError";
  }
}

export interface AmazonCooldownOptions {
  readonly cooldownHours?: number;
  readonly now?: () => Date;
}

/** @implements SPEC-STEP1C §4 — CAPTCHA 後の再開を実行を跨いで止める。回避はせず時間だけを置く。 */
export class AmazonCooldownGuard {
  private readonly cooldownHours: number;
  private readonly now: () => Date;

  public constructor(private readonly repository: CrawlCooldownRepository, options: AmazonCooldownOptions = {}) {
    this.cooldownHours = options.cooldownHours ?? DEFAULT_COOLDOWN_HOURS;
    this.now = options.now ?? (() => new Date());
  }

  public assertNotBlocked(): void {
    const cooldown = this.repository.find(AMAZON_COOLDOWN_SCOPE);
    if (cooldown === undefined) {
      return;
    }
    const blockedUntilMs = Date.parse(cooldown.blockedUntil);
    if (Number.isFinite(blockedUntilMs) && blockedUntilMs > this.now().getTime()) {
      throw new AmazonCooldownError(cooldown.blockedUntil, cooldown.reason);
    }
    this.repository.clear(AMAZON_COOLDOWN_SCOPE);
  }

  public block(reason: string): string {
    const now = this.now();
    const blockedUntil = new Date(now.getTime() + this.cooldownHours * MILLISECONDS_PER_HOUR).toISOString();
    this.repository.block(AMAZON_COOLDOWN_SCOPE, blockedUntil, reason, now.toISOString());
    return blockedUntil;
  }
}
