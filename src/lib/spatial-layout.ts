import type {
  PhotoDioramaSpatial,
  SpatialAnchor,
  SpatialPlaneSlot,
} from "@/lib/exhibit-schema";

export const PHOTO_DIORAMA_DISCLAIMER =
  "Generated spatial interpretation: source photos support cited objects and details, not their relative depth, distance, or placement.";

const SLOTS_BY_PHOTO_COUNT: Record<3 | 4 | 5, readonly SpatialPlaneSlot[]> = {
  3: ["near-left", "far-center", "near-right"],
  4: ["near-left", "mid-left", "mid-right", "near-right"],
  5: ["near-left", "mid-left", "far-center", "mid-right", "near-right"],
};

export function createPhotoDiorama(
  photoSourceIds: readonly string[],
  preset: PhotoDioramaSpatial["preset"] = "memory-corridor",
): PhotoDioramaSpatial | undefined {
  if (photoSourceIds.length < 3 || photoSourceIds.length > 5) return undefined;

  const slots = SLOTS_BY_PHOTO_COUNT[photoSourceIds.length as 3 | 4 | 5];
  return {
    kind: "photo-diorama",
    preset,
    disclaimer: PHOTO_DIORAMA_DISCLAIMER,
    planes: photoSourceIds.map((sourceId, index) => ({
      id: `plane-${sourceId}`,
      sourceId,
      slot: slots[index],
    })),
  };
}

export function createSpatialAnchor(
  planeId: string,
  xPercent: number,
  yPercent: number,
): SpatialAnchor {
  const normalizePercent = (value: number) => Math.min(1, Math.max(0, value / 100));
  return {
    planeId,
    u: normalizePercent(xPercent),
    v: normalizePercent(yPercent),
  };
}
