export const AMAZON_CRAWLER_PRODUCT_TOKEN = "SartorBot";
const AMAZON_USER_AGENT = `${AMAZON_CRAWLER_PRODUCT_TOKEN}/0.1 (+https://github.com/LUDIARS/Sartor; personal outfit research)`;
const MINIMUM_REQUEST_INTERVAL_MS = 2_000;
const REQUEST_JITTER_MAX_MS = 1_000;
const MAX_REQUESTS_PER_RUN = 120;
const RATE_LIMIT_WAIT_MS = 30_000;

export class AmazonCaptchaError extends Error {
  public constructor(endpoint: string) {
    super(`Amazon returned a CAPTCHA page for ${endpoint}.`);
    this.name = "AmazonCaptchaError";
  }
}

export class AmazonRateLimitedError extends Error {
  public constructor(endpoint: string) {
    super(`Amazon continued to rate-limit requests for ${endpoint}.`);
    this.name = "AmazonRateLimitedError";
  }
}

export class AmazonRequestLimitError extends Error {
  public constructor() {
    super(`Amazon crawl reached the fixed ${MAX_REQUESTS_PER_RUN}-request limit.`);
    this.name = "AmazonRequestLimitError";
  }
}

export class AmazonHttpError extends Error {
  public constructor(readonly statusCode: number, readonly endpoint: string) {
    super(`Amazon returned HTTP ${statusCode} for ${endpoint}.`);
    this.name = "AmazonHttpError";
  }
}

interface AmazonHttpOptions {
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
}

interface AmazonHttpResponse {
  readonly endpoint: string;
  readonly statusCode: number;
  readonly ok: boolean;
  readonly text: string;
}

/** 固定識別子・直列化・待機・停止条件を一か所で適用する Amazon HTTP クライアント。 */
export class AmazonHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private lastRequestStartedAt = 0;
  private requestCount = 0;
  private requestTail: Promise<void> = Promise.resolve();

  public constructor(options: AmazonHttpOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.random = options.random ?? Math.random;
  }

  public async getText(endpoint: string): Promise<string> {
    return this.runSerially(async () => {
      const first = await this.requestOnce(endpoint);
      this.throwIfCaptcha(first);
      if (first.ok) {
        return first.text;
      }
      if (!isRateLimited(first.statusCode)) {
        throw new AmazonHttpError(first.statusCode, endpoint);
      }

      await this.sleep(RATE_LIMIT_WAIT_MS);
      const second = await this.requestOnce(endpoint);
      this.throwIfCaptcha(second);
      if (second.ok) {
        return second.text;
      }
      if (isRateLimited(second.statusCode)) {
        throw new AmazonRateLimitedError(endpoint);
      }
      throw new AmazonHttpError(second.statusCode, endpoint);
    });
  }

  public get requestsMade(): number {
    return this.requestCount;
  }

  private async runSerially<T>(operation: () => Promise<T>): Promise<T> {
    let releaseSlot: (() => void) | undefined;
    const slot = new Promise<void>((resolve) => {
      releaseSlot = resolve;
    });
    const previousRequest = this.requestTail;
    this.requestTail = previousRequest.then(() => slot);
    await previousRequest;
    try {
      return await operation();
    } finally {
      releaseSlot?.();
    }
  }

  private async requestOnce(endpoint: string): Promise<AmazonHttpResponse> {
    if (this.requestCount >= MAX_REQUESTS_PER_RUN) {
      throw new AmazonRequestLimitError();
    }
    await this.waitForRequestInterval();
    this.requestCount += 1;
    const response = await this.fetchImpl(endpoint, {
      headers: {
        "user-agent": AMAZON_USER_AGENT,
        "accept-language": "ja-JP,ja;q=0.9",
      },
      redirect: "follow",
    });
    return {
      endpoint,
      statusCode: response.status,
      ok: response.ok,
      text: await response.text(),
    };
  }

  private async waitForRequestInterval(): Promise<void> {
    if (this.lastRequestStartedAt > 0) {
      const jitterMs = Math.floor(this.random() * (REQUEST_JITTER_MAX_MS + 1));
      const dueAt = this.lastRequestStartedAt + MINIMUM_REQUEST_INTERVAL_MS + jitterMs;
      const waitMs = dueAt - Date.now();
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
    }
    this.lastRequestStartedAt = Date.now();
  }

  private throwIfCaptcha(response: AmazonHttpResponse): void {
    if (response.text.includes("validateCaptcha") || response.text.includes("api-services-support@amazon.com")) {
      throw new AmazonCaptchaError(response.endpoint);
    }
  }
}

function isRateLimited(statusCode: number): boolean {
  return statusCode === 429 || statusCode === 503;
}
