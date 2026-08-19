import { AmazonCrawlRunner } from "../crawl/amazon/amazon-crawl-runner.js";
import {
  amazonPresetNames,
  queriesForAmazonPreset,
  type AmazonPresetName,
} from "../crawl/amazon/amazon-presets.js";
import { brandCatalogs, type FastRetailingBrand } from "../crawl/brand-catalog.js";
import { crawlBrandCatalog } from "../crawl/crawl-runner.js";
import type { Gender } from "../domain/types.js";
import { logError, logInfo } from "../log.js";
import { closeDatabase, openDatabase } from "../store/db.js";
import { GarmentRepository } from "../store/garment-repo.js";

interface FastRetailingCrawlArguments {
  readonly brand: FastRetailingBrand;
  readonly gender: Gender;
  readonly classArgument: string;
  readonly limit: number;
}

interface AmazonQueryCrawlArguments {
  readonly brand: "amazon";
  readonly gender: Gender;
  readonly classArgument: string;
  readonly query: string;
  readonly limit: number;
}

interface AmazonPresetCrawlArguments {
  readonly brand: "amazon";
  readonly gender: Gender;
  readonly preset: AmazonPresetName;
  readonly limit: number;
}

type CrawlArguments = FastRetailingCrawlArguments | AmazonQueryCrawlArguments | AmazonPresetCrawlArguments;

function readArgument(argumentsList: readonly string[], name: string): string {
  const value = readOptionalArgument(argumentsList, name);
  if (value === undefined) {
    throw new Error(`Missing required argument ${name}.`);
  }
  return value;
}

function readOptionalArgument(argumentsList: readonly string[], name: string): string | undefined {
  const position = argumentsList.indexOf(name);
  if (position < 0) {
    return undefined;
  }
  const value = argumentsList[position + 1];
  if (value === undefined || value.trim().length === 0 || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

function parseGender(value: string): Gender {
  if (value === "WOMEN" || value === "MEN" || value === "UNISEX") {
    return value;
  }
  throw new Error("--gender must be WOMEN, MEN, or UNISEX.");
}

function parseLimit(argumentsList: readonly string[]): number {
  const limit = Number(readArgument(argumentsList, "--limit"));
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  return limit;
}

function parseArguments(argumentsList: readonly string[]): CrawlArguments {
  const rawBrand = readArgument(argumentsList, "--brand");
  const limit = parseLimit(argumentsList);
  if (rawBrand in brandCatalogs) {
    return {
      brand: rawBrand as FastRetailingBrand,
      gender: parseGender(readArgument(argumentsList, "--gender")),
      classArgument: readArgument(argumentsList, "--class"),
      limit,
    };
  }
  if (rawBrand !== "amazon") {
    throw new Error("--brand must be uniqlo, gu, or amazon.");
  }

  const query = readOptionalArgument(argumentsList, "--query");
  const preset = readOptionalArgument(argumentsList, "--preset");
  if (query !== undefined && preset !== undefined) {
    throw new Error("Amazon crawl accepts either --query or --preset, not both.");
  }
  if (query === undefined && preset === undefined) {
    throw new Error("Amazon crawl requires --query or --preset.");
  }
  if (query !== undefined) {
    return {
      brand: "amazon",
      gender: parseGender(readArgument(argumentsList, "--gender")),
      classArgument: readArgument(argumentsList, "--class"),
      query,
      limit,
    };
  }
  if (!amazonPresetNames.includes(preset as AmazonPresetName)) {
    throw new Error(`--preset must be ${amazonPresetNames.join(" or ")}.`);
  }
  return {
    brand: "amazon",
    gender: parseGender(readOptionalArgument(argumentsList, "--gender") ?? "MEN"),
    preset: preset as AmazonPresetName,
    limit,
  };
}

function logCompleted(result: { brand: string; gender: Gender; className: string; upserted: number }): void {
  logInfo("catalog_crawl_completed", {
    brand: result.brand,
    gender: result.gender,
    className: result.className,
    upserted: result.upserted,
  });
}

async function crawlAmazon(repository: GarmentRepository, argumentsList: AmazonQueryCrawlArguments | AmazonPresetCrawlArguments): Promise<void> {
  if ("query" in argumentsList) {
    logCompleted(await new AmazonCrawlRunner(repository).crawl(argumentsList));
    return;
  }
  for (const query of queriesForAmazonPreset(argumentsList.preset)) {
    logCompleted(await new AmazonCrawlRunner(repository).crawl({
      gender: argumentsList.gender,
      classArgument: query.classArgument,
      query: query.query,
      limit: argumentsList.limit,
    }));
  }
}

async function main(): Promise<void> {
  const argumentsList = parseArguments(process.argv.slice(2));
  const database = openDatabase();
  try {
    const repository = new GarmentRepository(database);
    if (argumentsList.brand === "amazon") {
      await crawlAmazon(repository, argumentsList);
      return;
    }
    const result = await crawlBrandCatalog(repository, argumentsList);
    logCompleted(result);
  } finally {
    closeDatabase(database);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown crawl failure.";
  logError("catalog_crawl_failed", { message });
  process.exitCode = 1;
});
