import { describe, expect, it } from "vitest";

import {
  PHOTO_DIORAMA_DISCLAIMER,
  createPhotoDiorama,
  createSpatialAnchor,
} from "@/lib/spatial-layout";

describe("deterministic spatial layouts", () => {
  it.each([
    [3, ["near-left", "far-center", "near-right"]],
    [4, ["near-left", "mid-left", "mid-right", "near-right"]],
    [5, ["near-left", "mid-left", "far-center", "mid-right", "near-right"]],
  ] as const)("assigns stable slots for %i photos", (count, expectedSlots) => {
    const sourceIds = Array.from({ length: count }, (_, index) => `photo-${index + 1}`);
    const first = createPhotoDiorama(sourceIds);
    const second = createPhotoDiorama(sourceIds);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      kind: "photo-diorama",
      preset: "memory-corridor",
      disclaimer: PHOTO_DIORAMA_DISCLAIMER,
    });
    expect(first?.planes.map((plane) => plane.slot)).toEqual(expectedSlots);
    expect(first?.planes.map((plane) => plane.sourceId)).toEqual(sourceIds);
  });

  it("does not create a spatial room outside the supported 3–5 photo range", () => {
    expect(createPhotoDiorama(["one", "two"])).toBeUndefined();
    expect(createPhotoDiorama(["one", "two", "three", "four", "five", "six"])).toBeUndefined();
  });

  it("normalizes generated layout coordinates without treating them as evidence regions", () => {
    expect(createSpatialAnchor("plane-photo-1", 43, 20)).toEqual({
      planeId: "plane-photo-1",
      u: 0.43,
      v: 0.2,
    });
    expect(createSpatialAnchor("plane-photo-1", -5, 105)).toEqual({
      planeId: "plane-photo-1",
      u: 0,
      v: 1,
    });
  });
});
