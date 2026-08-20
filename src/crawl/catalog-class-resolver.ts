import type { GarmentKind, Gender } from "../domain/types.js";

import { classNamesForArgument, kindForClassName, type BrandCatalog } from "./brand-catalog.js";
import type { FastRetailCategory } from "./fast-retailing-client.js";

export const ALL_CLASSES_ARGUMENT = "all";

export interface CrawlTarget {
  readonly category: FastRetailCategory;
  readonly className: string;
  readonly kind: GarmentKind;
}

export function categoryName(category: FastRetailCategory): string | undefined {
  return category.name ?? category.label ?? category.displayName;
}

export function resolveGenderId(catalog: BrandCatalog, categories: readonly FastRetailCategory[], gender: Gender): string {
  const candidates = catalog.genderNames[gender];
  const category = categories.find((item) => {
    const name = categoryName(item);
    return name !== undefined && candidates.some((candidate) => name.toLocaleLowerCase() === candidate.toLocaleLowerCase());
  });
  if (category === undefined) {
    throw new Error(`${catalog.displayName} does not expose a ${gender} category in its product API.`);
  }
  return category.id;
}

function targetFor(category: FastRetailCategory): CrawlTarget | undefined {
  const className = categoryName(category);
  if (className === undefined) {
    return undefined;
  }
  const kind = kindForClassName(className);
  return kind === undefined ? undefined : { category, className, kind };
}

/**
 * @implements SPEC-STEP1C §3 — "all" でその性別の巡回可能な全クラスを返し、
 * それ以外は従来どおり 1 クラスへ解決する。除外語に当たるクラスは "all" から落とす。
 */
export function selectCrawlTargets(categories: readonly FastRetailCategory[], classArgument: string): CrawlTarget[] {
  if (classArgument.trim().toLowerCase() === ALL_CLASSES_ARGUMENT) {
    const targets = categories.flatMap((category) => {
      const target = targetFor(category);
      // 分類できないクラス (バッグ等の "other") は "all" 巡回では取りに行かない。名指しなら従来どおり取る。
      return target === undefined || target.kind === "other" ? [] : [target];
    });
    if (targets.length === 0) {
      throw new Error("The Fast Retailing category tree exposed no crawlable class.");
    }
    return targets;
  }

  const names = classNamesForArgument(classArgument);
  const category = categories.find((item) => {
    const name = categoryName(item);
    return name !== undefined && names.some((candidate) => name.includes(candidate));
  });
  if (category === undefined) {
    throw new Error(`No product class matched "${classArgument}" in the Fast Retailing category tree.`);
  }
  const target = targetFor(category);
  if (target === undefined) {
    throw new Error(`Class "${classArgument}" is intentionally excluded from the Sartor catalog.`);
  }
  return [target];
}
