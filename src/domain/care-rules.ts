import type { CareJudgement } from "./types.js";

const dryerProhibitedPhrases = ["乾燥機不可", "タンブル乾燥禁止", "タンブル乾燥不可"];
const dryerAllowedPhrases = ["乾燥機可", "タンブル乾燥可", "タンブル乾燥 低温"];
const colorBleedWarningPhrases = ["色落ち", "移染", "色移り", "単独洗い"];
const fragileMaterials = ["毛", "ウール", "シルク", "絹", "レーヨン", "麻", "リネン", "カシミヤ", "レザー"];
const cottonDominantColorNames = ["デニム", "インディゴ", "黒", "ブラック", "ネイビー", "濃紺", "赤", "レッド"];

function findPhrase(value: string, phrases: readonly string[]): string | undefined {
  return phrases.find((phrase) => value.includes(phrase));
}

function isPrimaryMaterial(composition: string, materials: readonly string[]): string | undefined {
  for (const material of materials) {
    const position = composition.indexOf(material);
    if (position < 0) {
      continue;
    }
    const percentageAfter = composition.slice(position + material.length).match(/^\s*(\d{1,3})\s*%/u)?.[1];
    const percentageBefore = composition.slice(0, position).match(/(\d{1,3})\s*%\s*$/u)?.[1];
    const percentage = percentageAfter ?? percentageBefore;
    if ((percentage === undefined && !composition.includes("%")) || Number(percentage) >= 50) {
      return material;
    }
  }
  return undefined;
}

function hasCottonAsPrimaryMaterial(composition: string): boolean {
  return isPrimaryMaterial(composition, ["綿", "コットン"]) !== undefined;
}

function judgeDryer(washingInformation: string, composition: string, reasons: string[]): boolean | null {
  const prohibitedPhrase = findPhrase(washingInformation, dryerProhibitedPhrases);
  if (prohibitedPhrase !== undefined) {
    reasons.push(`洗濯表示「${prohibitedPhrase}」のため乾燥機不可`);
    return false;
  }

  const allowedPhrase = findPhrase(washingInformation, dryerAllowedPhrases);
  if (allowedPhrase !== undefined) {
    reasons.push(`洗濯表示「${allowedPhrase}」のため乾燥機可`);
    return true;
  }

  const fragileMaterial = isPrimaryMaterial(composition, fragileMaterials);
  if (fragileMaterial !== undefined) {
    reasons.push(`${fragileMaterial}が主成分で洗濯表示がないため、乾燥機不可として扱う`);
    return false;
  }

  reasons.push("乾燥機の表示なし・素材から推定不可");
  return null;
}

function judgeColorBleed(washingInformation: string, composition: string, colorName: string, reasons: string[]): CareJudgement["colorBleedRisk"] {
  const warningPhrase = findPhrase(washingInformation, colorBleedWarningPhrases);
  if (warningPhrase !== undefined) {
    reasons.push(`洗濯表示「${warningPhrase}」のため色落ちリスク高`);
    return "high";
  }

  const matchedColor = findPhrase(colorName, cottonDominantColorNames);
  if (matchedColor !== undefined && hasCottonAsPrimaryMaterial(composition)) {
    reasons.push(`${matchedColor}かつ綿主体のため色落ちリスク中`);
    return "mid";
  }

  if (washingInformation.length === 0 && composition.length === 0 && colorName.length === 0) {
    reasons.push("色・素材・洗濯表示の情報なし");
    return null;
  }

  reasons.push("色落ちを示す洗濯表示なし");
  return "low";
}

export function judgeCare(composition: string | null | undefined, washingInformation: string | null | undefined, colorName: string | null | undefined): CareJudgement {
  const normalizedComposition = composition?.trim() ?? "";
  const normalizedWashingInformation = washingInformation?.trim() ?? "";
  const normalizedColorName = colorName?.trim() ?? "";
  const reasons: string[] = [];

  const dryerOk = judgeDryer(normalizedWashingInformation, normalizedComposition, reasons);
  const colorBleedRisk = judgeColorBleed(normalizedWashingInformation, normalizedComposition, normalizedColorName, reasons);

  return { dryerOk, colorBleedRisk, reasons };
}
