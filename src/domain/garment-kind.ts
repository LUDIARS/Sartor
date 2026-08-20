import { z } from "zod";

/** 商品の大分類。細分類 (GarmentSubKind) との循環 import を避けるため独立ファイルに置く。 */
export const garmentKindSchema = z.enum([
  "tops",
  "bottoms",
  "outer",
  "onepiece",
  "shoes",
  "accessory",
  "inner",
  "other",
]);
export type GarmentKind = z.infer<typeof garmentKindSchema>;
