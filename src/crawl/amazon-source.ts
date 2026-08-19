export class NotConfiguredError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "NotConfiguredError";
  }
}

const requiredAmazonEnvironmentVariables = [
  "SARTOR_AMAZON_PAAPI_ACCESS_KEY",
  "SARTOR_AMAZON_PAAPI_SECRET_KEY",
  "SARTOR_AMAZON_PAAPI_PARTNER_TAG",
] as const;

export function requireAmazonPaApiConfiguration(environment: NodeJS.ProcessEnv = process.env): void {
  const missing = requiredAmazonEnvironmentVariables.filter((name) => {
    const value = environment[name];
    return value === undefined || value.trim().length === 0;
  });
  if (missing.length > 0) {
    throw new NotConfiguredError(`Amazon Product Advertising API is not configured. Missing: ${missing.join(", ")}.`);
  }
}

/** Step 1 intentionally does not make Amazon calls; catalog access must use PA-API, never HTML scraping. */
export async function crawlAmazonCatalog(): Promise<never> {
  requireAmazonPaApiConfiguration();
  throw new NotConfiguredError("Amazon Product Advertising API crawling is not implemented in Sartor Step 1.");
}
