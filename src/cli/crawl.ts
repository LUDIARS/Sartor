import { brandCatalogs, type FastRetailingBrand } from "../crawl/brand-catalog.js";
import { crawlBrandCatalog } from "../crawl/crawl-runner.js";
import type { Gender } from "../domain/types.js";
import { logError, logInfo } from "../log.js";
import { closeDatabase, openDatabase } from "../store/db.js";
import { GarmentRepository } from "../store/garment-repo.js";

interface CrawlArguments {
  readonly brand: FastRetailingBrand;
  readonly gender: Gender;
  readonly classArgument: string;
  readonly limit: number;
}

function readArgument(argumentsList: readonly string[], name: string): string {
  const position = argumentsList.indexOf(name);
  const value = position < 0 ? undefined : argumentsList[position + 1];
  if (value === undefined || value.trim().length === 0 || value.startsWith("--")) {
    throw new Error(`Missing required argument ${name}.`);
  }
  return value;
}

function parseArguments(argumentsList: readonly string[]): CrawlArguments {
  const rawBrand = readArgument(argumentsList, "--brand");
  if (!(rawBrand in brandCatalogs)) {
    throw new Error("--brand must be uniqlo or gu.");
  }
  const brand = rawBrand as FastRetailingBrand;
  const gender = readArgument(argumentsList, "--gender");
  if (gender !== "WOMEN" && gender !== "MEN" && gender !== "UNISEX") {
    throw new Error("--gender must be WOMEN, MEN, or UNISEX.");
  }
  const limit = Number(readArgument(argumentsList, "--limit"));
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  return { brand, gender, classArgument: readArgument(argumentsList, "--class"), limit };
}

async function main(): Promise<void> {
  const argumentsList = parseArguments(process.argv.slice(2));
  const database = openDatabase();
  try {
    const result = await crawlBrandCatalog(new GarmentRepository(database), argumentsList);
    logInfo("catalog_crawl_completed", {
      brand: result.brand,
      gender: result.gender,
      className: result.className,
      kind: result.kind,
      upserted: result.upserted,
    });
  } finally {
    closeDatabase(database);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown crawl failure.";
  logError("catalog_crawl_failed", { message });
  process.exitCode = 1;
});
