import { amazonPresetNames, type AmazonPresetName } from "../crawl/amazon/amazon-presets.js";
import { brandCatalogs, type FastRetailingBrand } from "../crawl/brand-catalog.js";
import { ALL_CLASSES_ARGUMENT } from "../crawl/catalog-class-resolver.js";
import { garmentSubKindSchema, type GarmentSubKind } from "../domain/garment-subkind.js";
import type { Gender } from "../domain/types.js";

const DEFAULT_REFRESH_HOURS = 24;

export interface FastRetailingCrawlArguments {
  readonly brand: FastRetailingBrand;
  readonly gender: Gender;
  readonly classArgument: string;
  readonly limit?: number;
  readonly refreshAfterHours: number;
}

export interface AmazonQueryCrawlArguments {
  readonly brand: "amazon";
  readonly gender: Gender;
  readonly classArgument: string;
  readonly query: string;
  readonly limit: number;
  readonly subKind?: GarmentSubKind;
  readonly restart: boolean;
}

export interface AmazonPresetCrawlArguments {
  readonly brand: "amazon";
  readonly gender: Gender;
  readonly preset: AmazonPresetName;
  readonly limit: number;
  readonly restart: boolean;
}

export type CrawlArguments = FastRetailingCrawlArguments | AmazonQueryCrawlArguments | AmazonPresetCrawlArguments;

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

function hasFlag(argumentsList: readonly string[], name: string): boolean {
  return argumentsList.includes(name);
}

function parseGender(value: string): Gender {
  if (value === "WOMEN" || value === "MEN" || value === "UNISEX") {
    return value;
  }
  throw new Error("--gender must be WOMEN, MEN, or UNISEX.");
}

function parsePositiveInteger(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function parseNonNegativeNumber(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be zero or a positive number.`);
  }
  return value;
}

/** @implements SPEC-STEP1C §3 — --limit は任意 (省略でクラス全件)、--class の既定は "all" 巡回。 */
function parseFastRetailingArguments(argumentsList: readonly string[], brand: FastRetailingBrand): FastRetailingCrawlArguments {
  const rawLimit = readOptionalArgument(argumentsList, "--limit");
  const rawRefreshHours = readOptionalArgument(argumentsList, "--refresh-hours");
  return {
    brand,
    gender: parseGender(readArgument(argumentsList, "--gender")),
    classArgument: readOptionalArgument(argumentsList, "--class") ?? ALL_CLASSES_ARGUMENT,
    ...(rawLimit === undefined ? {} : { limit: parsePositiveInteger(rawLimit, "--limit") }),
    refreshAfterHours: rawRefreshHours === undefined
      ? DEFAULT_REFRESH_HOURS
      : parseNonNegativeNumber(rawRefreshHours, "--refresh-hours"),
  };
}

function parseAmazonArguments(argumentsList: readonly string[]): AmazonQueryCrawlArguments | AmazonPresetCrawlArguments {
  const limit = parsePositiveInteger(readArgument(argumentsList, "--limit"), "--limit");
  const restart = hasFlag(argumentsList, "--restart");
  const query = readOptionalArgument(argumentsList, "--query");
  const preset = readOptionalArgument(argumentsList, "--preset");
  if (query !== undefined && preset !== undefined) {
    throw new Error("Amazon crawl accepts either --query or --preset, not both.");
  }
  if (query === undefined && preset === undefined) {
    throw new Error("Amazon crawl requires --query or --preset.");
  }
  if (query !== undefined) {
    const rawSubKind = readOptionalArgument(argumentsList, "--subkind");
    return {
      brand: "amazon",
      gender: parseGender(readArgument(argumentsList, "--gender")),
      classArgument: readArgument(argumentsList, "--class"),
      query,
      limit,
      ...(rawSubKind === undefined ? {} : { subKind: garmentSubKindSchema.parse(rawSubKind) }),
      restart,
    };
  }
  if (!amazonPresetNames.includes(preset as AmazonPresetName)) {
    throw new Error(`--preset must be one of ${amazonPresetNames.join(", ")}.`);
  }
  return {
    brand: "amazon",
    gender: parseGender(readOptionalArgument(argumentsList, "--gender") ?? "MEN"),
    preset: preset as AmazonPresetName,
    limit,
    restart,
  };
}

export function parseCrawlArguments(argumentsList: readonly string[]): CrawlArguments {
  const rawBrand = readArgument(argumentsList, "--brand");
  if (rawBrand in brandCatalogs) {
    return parseFastRetailingArguments(argumentsList, rawBrand as FastRetailingBrand);
  }
  if (rawBrand !== "amazon") {
    throw new Error("--brand must be uniqlo, gu, or amazon.");
  }
  return parseAmazonArguments(argumentsList);
}
