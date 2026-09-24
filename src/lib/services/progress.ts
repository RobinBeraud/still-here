import { LIFE_AREAS, type LifeArea } from "@/lib/constants";

/**
 * Indicateur de progression UX — NON scientifique.
 * Ne mesure pas une « identité » : il encourage simplement à documenter chaque domaine.
 */
const TARGET_PER_AREA: Record<LifeArea, number> = {
  life_story: 8,
  childhood: 6,
  family: 6,
  relationships: 5,
  career: 5,
  values: 4,
  advice: 4,
  personality: 5, // traits confirmés
  photos: 10, // photos avec récit
  voice: 1, // avatar/voix prêts
};

export type ProgressInput = {
  memoriesByArea: Partial<Record<LifeArea, number>>;
  confirmedTraits: number;
  photosWithStory: number;
  avatarReady: boolean;
};

export type Progress = { total: number; areas: { area: LifeArea; percent: number }[] };

export function computeProgress(input: ProgressInput): Progress {
  const areas = LIFE_AREAS.map((area) => {
    let count = input.memoriesByArea[area] ?? 0;
    if (area === "personality") count = input.confirmedTraits;
    if (area === "photos") count = input.photosWithStory;
    if (area === "voice") count = input.avatarReady ? 1 : 0;
    const percent = Math.min(100, Math.round((count / TARGET_PER_AREA[area]) * 100));
    return { area, percent };
  });
  const total = Math.round(areas.reduce((s, a) => s + a.percent, 0) / areas.length);
  return { total, areas };
}

export function underdocumentedAreas(p: Progress, limit = 3): LifeArea[] {
  return [...p.areas]
    .filter((a) => a.area !== "voice" && a.area !== "photos" && a.area !== "personality")
    .sort((a, b) => a.percent - b.percent)
    .slice(0, limit)
    .map((a) => a.area);
}
