import {
  ageBandSchema,
  colorToneSchema,
  seasonSchema,
  styleAxisSchema,
  tpoSchema,
  type AgeBand,
  type Tpo,
  type WeightedStyle,
} from "./types.js";

export const ageBandVocabulary = ageBandSchema.options;
export const tpoVocabulary = tpoSchema.options;
export const styleAxisVocabulary = styleAxisSchema.options;
export const seasonVocabulary = seasonSchema.options;
export const colorToneVocabulary = colorToneSchema.options;

const workStyles: readonly WeightedStyle[] = [
  { style: "clean", weight: 3 },
  { style: "minimal", weight: 2 },
  { style: "classic", weight: 2 },
];
const casualStyles: readonly WeightedStyle[] = [
  { style: "casual", weight: 3 },
  { style: "natural", weight: 2 },
  { style: "minimal", weight: 1 },
];
const dateStyles: readonly WeightedStyle[] = [
  { style: "clean", weight: 3 },
  { style: "feminine", weight: 2 },
  { style: "classic", weight: 1 },
];
const formalStyles: readonly WeightedStyle[] = [
  { style: "classic", weight: 3 },
  { style: "clean", weight: 3 },
  { style: "minimal", weight: 2 },
];
const outdoorStyles: readonly WeightedStyle[] = [
  { style: "outdoor", weight: 3 },
  { style: "sporty", weight: 2 },
  { style: "casual", weight: 1 },
];
const homeStyles: readonly WeightedStyle[] = [
  { style: "casual", weight: 3 },
  { style: "natural", weight: 2 },
  { style: "sporty", weight: 1 },
];
const travelStyles: readonly WeightedStyle[] = [
  { style: "casual", weight: 3 },
  { style: "sporty", weight: 2 },
  { style: "clean", weight: 1 },
];

const baseDefaults: Readonly<Record<Tpo, readonly WeightedStyle[]>> = {
  work: workStyles,
  casual: casualStyles,
  date: dateStyles,
  formal: formalStyles,
  outdoor: outdoorStyles,
  home: homeStyles,
  travel: travelStyles,
};

/** A static age-band × TPO table used as the editable vector preset. */
export const styleDefaultsByAgeAndTpo: Readonly<Record<AgeBand, Readonly<Record<Tpo, readonly WeightedStyle[]>>>> = {
  "10s": {
    ...baseDefaults,
    casual: [{ style: "casual", weight: 3 }, { style: "street", weight: 2 }, { style: "sporty", weight: 2 }],
    date: [{ style: "casual", weight: 3 }, { style: "clean", weight: 2 }, { style: "feminine", weight: 2 }],
  },
  "20s": {
    ...baseDefaults,
    work: [{ style: "clean", weight: 3 }, { style: "minimal", weight: 2 }, { style: "mode", weight: 1 }],
    casual: [{ style: "casual", weight: 3 }, { style: "street", weight: 2 }, { style: "natural", weight: 1 }],
  },
  "30s": {
    ...baseDefaults,
    work: [{ style: "clean", weight: 3 }, { style: "classic", weight: 2 }, { style: "minimal", weight: 2 }],
    date: [{ style: "clean", weight: 3 }, { style: "classic", weight: 2 }, { style: "feminine", weight: 1 }],
  },
  "40s": {
    ...baseDefaults,
    work: [{ style: "clean", weight: 3 }, { style: "classic", weight: 3 }, { style: "minimal", weight: 1 }],
    casual: [{ style: "natural", weight: 3 }, { style: "clean", weight: 2 }, { style: "classic", weight: 1 }],
  },
  "50s": {
    ...baseDefaults,
    work: [{ style: "classic", weight: 3 }, { style: "clean", weight: 3 }, { style: "natural", weight: 1 }],
    casual: [{ style: "natural", weight: 3 }, { style: "classic", weight: 2 }, { style: "minimal", weight: 1 }],
  },
  "60s+": {
    ...baseDefaults,
    work: [{ style: "classic", weight: 3 }, { style: "clean", weight: 2 }, { style: "natural", weight: 2 }],
    casual: [{ style: "natural", weight: 3 }, { style: "classic", weight: 2 }, { style: "casual", weight: 1 }],
  },
};

export function defaultsFor(ageBand: AgeBand, tpo: Tpo): WeightedStyle[] {
  return styleDefaultsByAgeAndTpo[ageBand][tpo].map((style) => ({ ...style }));
}
