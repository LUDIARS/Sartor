import { z } from "zod";

import { japaneseSizeSchema } from "./size.js";

export const genderSchema = z.enum(["WOMEN", "MEN", "UNISEX"]);
export type Gender = z.infer<typeof genderSchema>;

export const ageBandSchema = z.enum(["10s", "20s", "30s", "40s", "50s", "60s+"]);
export type AgeBand = z.infer<typeof ageBandSchema>;

export const tpoSchema = z.enum(["work", "casual", "date", "formal", "outdoor", "home", "travel"]);
export type Tpo = z.infer<typeof tpoSchema>;

export const styleAxisSchema = z.enum([
  "clean",
  "casual",
  "street",
  "mode",
  "natural",
  "sporty",
  "classic",
  "minimal",
  "feminine",
  "outdoor",
]);
export type StyleAxis = z.infer<typeof styleAxisSchema>;

export const seasonSchema = z.enum(["spring", "summer", "autumn", "winter"]);
export type Season = z.infer<typeof seasonSchema>;

export const colorToneSchema = z.enum(["mono", "earth", "pastel", "vivid", "navy-based"]);
export type ColorTone = z.infer<typeof colorToneSchema>;

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

export const colorBleedRiskSchema = z.enum(["low", "mid", "high"]);
export type ColorBleedRisk = z.infer<typeof colorBleedRiskSchema>;

export const careJudgementSchema = z.object({
  dryerOk: z.boolean().nullable(),
  colorBleedRisk: colorBleedRiskSchema.nullable(),
  reasons: z.array(z.string()),
});
export type CareJudgement = z.infer<typeof careJudgementSchema>;

export const garmentSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  productId: z.string().min(1),
  priceGroup: z.string().min(1),
  name: z.string().min(1),
  gender: genderSchema,
  kind: garmentKindSchema,
  priceJpy: z.number().int().nonnegative(),
  currency: z.string().min(1),
  colors: z.array(z.string()),
  sizes: z.array(z.string()),
  composition: z.string().nullable(),
  washingInformation: z.string().nullable(),
  dryerOk: z.boolean().nullable(),
  colorBleedRisk: colorBleedRiskSchema.nullable(),
  careReasons: z.array(z.string()),
  imageUrl: z.string().url().nullable(),
  productUrl: z.string().url(),
  rawJson: z.string(),
  crawledAt: z.string().datetime(),
});
export type Garment = z.infer<typeof garmentSchema>;

export const profileSchema = z.object({
  id: z.literal(1),
  displayName: z.string().trim().max(100).nullable(),
  gender: genderSchema,
  ageBand: ageBandSchema,
  heightCm: z.number().int().min(80).max(260).nullable(),
  weightKg: z.number().int().min(20).max(300).nullable(),
  topSize: japaneseSizeSchema.nullable(),
  bottomSize: japaneseSizeSchema.nullable(),
  bodyNotes: z.string().trim().max(1_000).nullable(),
  favColors: z.array(z.string().trim().min(1).max(50)).max(20),
  avoidColors: z.array(z.string().trim().min(1).max(50)).max(20),
  ngMaterials: z.array(z.string().trim().min(1).max(50)).max(20),
  usesDryer: z.boolean(),
  avoidColorBleed: z.boolean(),
  monthlyBudgetJpy: z.number().int().positive().max(10_000_000),
  updatedAt: z.string().datetime(),
});
export type Profile = z.infer<typeof profileSchema>;

export const profileInputSchema = profileSchema
  .omit({ id: true, updatedAt: true })
  .extend({
    displayName: z.string().trim().max(100).optional().nullable(),
    heightCm: z.number().int().min(80).max(260).optional().nullable(),
    weightKg: z.number().int().min(20).max(300).optional().nullable(),
    topSize: japaneseSizeSchema,
    bottomSize: japaneseSizeSchema,
    bodyNotes: z.string().trim().max(1_000).optional().nullable(),
  });
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const weightedStyleSchema = z.object({
  style: styleAxisSchema,
  weight: z.number().int().min(1).max(3),
});
export type WeightedStyle = z.infer<typeof weightedStyleSchema>;

export const fashionVectorSchema = z.object({
  ageBand: ageBandSchema,
  tpo: tpoSchema,
  styles: z.array(weightedStyleSchema).min(1).max(styleAxisSchema.options.length),
  season: seasonSchema.optional(),
  colorTone: colorToneSchema.optional(),
});
export type FashionVector = z.infer<typeof fashionVectorSchema>;

export const proposalDecisionSchema = z.enum(["accept", "hold", "reject"]);
export type ProposalDecision = z.infer<typeof proposalDecisionSchema>;

export const proposalItemSchema = z.object({
  garmentId: z.string().min(1),
  role: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(1_000),
  garment: garmentSchema,
});
export type ProposalItem = z.infer<typeof proposalItemSchema>;

export const outfitOptionSchema = z.object({
  optionIndex: z.number().int().min(0).max(2),
  items: z.array(proposalItemSchema).min(1),
  totalJpy: z.number().int().nonnegative(),
  overBudget: z.boolean(),
  rationale: z.string().trim().min(1).max(3_000),
  cautions: z.array(z.string().trim().min(1).max(1_000)),
});
export type OutfitOption = z.infer<typeof outfitOptionSchema>;

export const proposalRequestSchema = z.object({
  vector: fashionVectorSchema,
  budgetJpy: z.number().int().positive().max(10_000_000),
  kinds: z.array(garmentKindSchema).min(1).max(garmentKindSchema.options.length),
});
export type ProposalRequest = z.infer<typeof proposalRequestSchema>;

export const decisionInputSchema = z.object({
  optionIndex: z.number().int().min(0).max(2),
  decision: proposalDecisionSchema,
  note: z.string().trim().max(2_000).optional().nullable(),
});
export type DecisionInput = z.infer<typeof decisionInputSchema>;
