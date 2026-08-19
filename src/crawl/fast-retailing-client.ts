import { z } from "zod";

import type { BrandCatalog } from "./brand-catalog.js";

const MINIMUM_REQUEST_INTERVAL_MS = 300;
const MAX_RETRIES = 2;
const USER_AGENT = "Sartor/0.1 (+LUDIARS prototype)";

const categorySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().optional(),
  label: z.string().optional(),
  displayName: z.string().optional(),
}).passthrough();

const catalogItemSchema = z.object({
  productId: z.string(),
  priceGroup: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  genderCategory: z.string().optional(),
  prices: z.object({
    base: z.object({ value: z.union([z.string(), z.number()]) }).optional(),
  }).optional(),
  colors: z.array(z.object({
    name: z.string().optional(),
    displayName: z.string().optional(),
    colorName: z.string().optional(),
    code: z.union([z.string(), z.number()]).optional(),
  }).passthrough()).default([]),
  sizes: z.array(z.object({
    name: z.string().optional(),
    displayName: z.string().optional(),
    size: z.string().optional(),
  }).passthrough()).default([]),
  images: z.object({
    main: z.record(z.string(), z.object({ image: z.string() }).passthrough()).optional(),
  }).optional(),
}).passthrough();

const productListSchema = z.object({
  result: z.object({
    items: z.array(catalogItemSchema).default([]),
    pagination: z.object({
      total: z.number().int().nonnegative().optional(),
      offset: z.number().int().nonnegative().optional(),
      count: z.number().int().nonnegative().optional(),
    }).optional(),
    aggregations: z.object({
      tree: z.object({
        genders: z.array(categorySchema).default([]),
        classes: z.array(categorySchema).default([]),
      }).passthrough(),
    }).optional(),
  }).passthrough(),
});

const productDetailsSchema = z.object({
  result: z.object({
    composition: z.string().nullable().optional(),
    washingInformation: z.string().nullable().optional(),
    breadcrumbs: z.unknown().optional(),
    longDescription: z.string().nullable().optional(),
  }).passthrough(),
});

export type FastRetailCategory = z.infer<typeof categorySchema>;
export type FastRetailCatalogItem = z.infer<typeof catalogItemSchema>;
export type FastRetailProductDetails = z.infer<typeof productDetailsSchema>["result"];

export interface FastRetailProductList {
  readonly items: FastRetailCatalogItem[];
  readonly total: number;
  readonly offset: number;
  readonly count: number;
  readonly genders: FastRetailCategory[];
  readonly classes: FastRetailCategory[];
}

export class FastRetailHttpError extends Error {
  public constructor(readonly statusCode: number, readonly endpoint: string) {
    super(`Fast Retailing API returned HTTP ${statusCode} for ${endpoint}.`);
    this.name = "FastRetailHttpError";
  }
}

export class FastRetailingClient {
  private lastRequestStartedAt = 0;
  private requestTail: Promise<void> = Promise.resolve();

  public constructor(private readonly catalog: BrandCatalog) {}

  public async getCategoryTree(): Promise<Pick<FastRetailProductList, "genders" | "classes">> {
    const list = await this.listProducts("", "", 1, 0);
    return { genders: list.genders, classes: list.classes };
  }

  public async getClassesForGender(genderId: string): Promise<FastRetailCategory[]> {
    const list = await this.listProducts(genderId, "", 1, 0);
    return list.classes;
  }

  public async listProducts(genderId: string, classId: string, limit: number, offset: number): Promise<FastRetailProductList> {
    const params = new URLSearchParams({
      path: `${genderId},${classId},,`,
      limit: String(limit),
      offset: String(offset),
      httpFailure: "true",
    });
    const payload = await this.requestJson(`/jp/api/commerce/v5/ja/products?${params.toString()}`);
    const parsed = productListSchema.parse(payload).result;
    const pagination = parsed.pagination;
    return {
      items: parsed.items,
      total: pagination?.total ?? parsed.items.length,
      offset: pagination?.offset ?? offset,
      count: pagination?.count ?? parsed.items.length,
      genders: parsed.aggregations?.tree.genders ?? [],
      classes: parsed.aggregations?.tree.classes ?? [],
    };
  }

  public async getProductDetails(productId: string, priceGroup: string): Promise<FastRetailProductDetails> {
    const productPath = `/jp/api/commerce/v5/ja/products/${encodeURIComponent(productId)}/price-groups/${encodeURIComponent(priceGroup)}/details`;
    const params = new URLSearchParams({ includeModelSize: "false", httpFailure: "true" });
    const payload = await this.requestJson(`${productPath}?${params.toString()}`);
    return productDetailsSchema.parse(payload).result;
  }

  private async requestJson(path: string): Promise<unknown> {
    let releaseSlot!: () => void;
    const slot = new Promise<void>((resolve) => {
      releaseSlot = resolve;
    });
    const previousRequest = this.requestTail;
    this.requestTail = previousRequest.then(() => slot);
    await previousRequest;

    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        await this.waitForRequestInterval();
        const endpoint = new URL(path, this.catalog.baseUrl).toString();
        const response = await fetch(endpoint, { headers: { "user-agent": USER_AGENT } });
        if (response.ok) {
          return await response.json();
        }
        if (attempt === MAX_RETRIES) {
          throw new FastRetailHttpError(response.status, endpoint);
        }
      }
      throw new Error("Fast Retailing request retry loop ended unexpectedly.");
    } finally {
      releaseSlot();
    }
  }

  private async waitForRequestInterval(): Promise<void> {
    const remaining = this.lastRequestStartedAt + MINIMUM_REQUEST_INTERVAL_MS - Date.now();
    if (remaining > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining));
    }
    this.lastRequestStartedAt = Date.now();
  }
}
