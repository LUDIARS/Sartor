export interface AmazonPresetQuery {
  readonly classArgument: string;
  readonly query: string;
}

export const mensOfficeCasual40sPreset: readonly AmazonPresetQuery[] = [
  { classArgument: "shirts", query: "メンズ オフィスカジュアル シャツ 40代" },
  { classArgument: "knit", query: "メンズ ニット オフィスカジュアル 40代" },
  { classArgument: "pants", query: "メンズ スラックス オフィスカジュアル 40代" },
  { classArgument: "jacket", query: "メンズ ジャケット オフィスカジュアル 40代" },
  { classArgument: "shoes", query: "メンズ 革靴 ビジネスカジュアル" },
];

export const amazonPresetNames = ["mens-office-casual-40s"] as const;
export type AmazonPresetName = typeof amazonPresetNames[number];

export function queriesForAmazonPreset(preset: AmazonPresetName): readonly AmazonPresetQuery[] {
  if (preset === "mens-office-casual-40s") {
    return mensOfficeCasual40sPreset;
  }
  throw new Error(`Unknown Amazon crawl preset: ${preset}.`);
}
