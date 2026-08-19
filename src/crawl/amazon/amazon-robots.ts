import {
  AMAZON_CRAWLER_PRODUCT_TOKEN,
  AmazonCaptchaError,
  AmazonRateLimitedError,
  AmazonRequestLimitError,
  type AmazonHttpClient,
} from "./amazon-http.js";

const AMAZON_ROBOTS_URL = "https://www.amazon.co.jp/robots.txt";

export class AmazonCrawlBlockedError extends Error {
  public constructor(detail: string) {
    super(`Amazon crawl was blocked before catalog access: ${detail}`);
    this.name = "AmazonCrawlBlockedError";
  }
}

interface RobotsRule {
  readonly directive: "allow" | "disallow";
  readonly path: string;
}

interface RobotsGroup {
  readonly agents: readonly string[];
  readonly rules: readonly RobotsRule[];
}

/** robots.txt で実際の crawler token と取得 URL が許可されることを確認する。 */
export async function assertAmazonRobotsAllowCatalog(http: AmazonHttpClient, searchEndpoint: string): Promise<void> {
  let robotsText: string;
  try {
    robotsText = await http.getText(AMAZON_ROBOTS_URL);
  } catch (error) {
    if (error instanceof AmazonCaptchaError || error instanceof AmazonRateLimitedError || error instanceof AmazonRequestLimitError) {
      throw error;
    }
    throw new AmazonCrawlBlockedError("robots.txt を取得できませんでした。");
  }

  const rules = rulesForAgent(parseRobotsGroups(robotsText), AMAZON_CRAWLER_PRODUCT_TOKEN);
  if (rules === undefined) {
    throw new AmazonCrawlBlockedError("robots.txt に適用可能な User-agent グループがありません。");
  }
  const searchUrl = new URL(searchEndpoint);
  const searchPath = `${searchUrl.pathname}${searchUrl.search}`;
  if (!isAllowed(rules, searchPath) || !isAllowed(rules, "/dp/B000000000")) {
    throw new AmazonCrawlBlockedError("robots.txt が検索または商品ページを許可していません。");
  }
}

function rulesForAgent(groups: readonly RobotsGroup[], productToken: string): readonly RobotsRule[] | undefined {
  const normalizedToken = productToken.toLowerCase();
  const specificGroups = groups.filter((group) => group.agents.includes(normalizedToken));
  const selectedGroups = specificGroups.length > 0
    ? specificGroups
    : groups.filter((group) => group.agents.includes("*"));
  return selectedGroups.length === 0 ? undefined : selectedGroups.flatMap((group) => group.rules);
}

function parseRobotsGroups(text: string): RobotsGroup[] {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | undefined;
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*/u, "").trim();
    if (line.length === 0) {
      continue;
    }
    const userAgent = line.match(/^user-agent\s*:\s*(.+)$/iu)?.[1]?.trim().toLowerCase();
    if (userAgent !== undefined) {
      if (current === undefined || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(userAgent);
      continue;
    }
    const rule = line.match(/^(allow|disallow)\s*:\s*(.*)$/iu);
    const directive = rule?.[1];
    const pathValue = rule?.[2];
    if (directive === undefined || pathValue === undefined || current === undefined) {
      continue;
    }
    const path = pathValue.trim();
    if (path.length > 0) {
      current.rules.push({ directive: directive.toLowerCase() as RobotsRule["directive"], path });
    }
  }
  return groups;
}

function isAllowed(rules: readonly RobotsRule[], path: string): boolean {
  const matching = rules.filter((rule) => ruleMatches(rule.path, path));
  if (matching.length === 0) {
    return true;
  }
  const longestPath = Math.max(...matching.map((rule) => rule.path.length));
  return matching
    .filter((rule) => rule.path.length === longestPath)
    .some((rule) => rule.directive === "allow");
}

function ruleMatches(rulePath: string, path: string): boolean {
  const pattern = rulePath
    .replace(/[|\\{}()[\]^$+?.]/gu, "\\$&")
    .replace(/\*/gu, ".*")
    .replace(/\\\$$/u, "$");
  return new RegExp(`^${pattern}`, "u").test(path);
}
