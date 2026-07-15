import { describe, expect, it } from "vitest";

import { exhibitManifestSchema } from "@/lib/exhibit-schema";
import {
  bicycleRepairExhibit,
  getSampleExhibit,
  nightMarketExhibit,
  sampleExhibits,
} from "@/lib/sample-exhibits";

describe("sample exhibits", () => {
  it("ships two schema-valid, single-scene manifests", () => {
    expect(sampleExhibits).toHaveLength(2);
    for (const exhibit of sampleExhibits) {
      expect(exhibitManifestSchema.parse(exhibit)).toEqual(exhibit);
      expect(exhibit.scenes).toHaveLength(1);
    }
  });

  it("uses materially different interaction mechanics", () => {
    const nightInteraction = nightMarketExhibit.scenes[0].interaction;
    const repairInteraction = bicycleRepairExhibit.scenes[0].interaction;

    expect(nightInteraction.kind).toBe("collect");
    expect(repairInteraction.kind).toBe("sequence");
    if (nightInteraction.kind === "collect") expect(nightInteraction.targetHotspotIds).toHaveLength(3);
    if (repairInteraction.kind === "sequence") expect(repairInteraction.stepHotspotIds).toHaveLength(4);
  });

  it("labels generated presentation choices at every interactive detail", () => {
    for (const exhibit of sampleExhibits) {
      for (const hotspot of exhibit.scenes[0].hotspots) {
        expect(hotspot.interpretation?.length).toBeGreaterThan(10);
      }
    }
  });

  it("uses timestamp ranges that match the deterministic narration assets", () => {
    const nightRanges = nightMarketExhibit.sources
      .filter((source) => source.kind === "audio")
      .map((source) => [source.timeStartSeconds, source.timeEndSeconds]);
    const repairRanges = bicycleRepairExhibit.sources
      .filter((source) => source.kind === "audio")
      .map((source) => [source.timeStartSeconds, source.timeEndSeconds]);

    expect(nightRanges).toEqual([
      [0, 5.28],
      [5.53, 8.62],
      [8.87, 11.61],
    ]);
    expect(repairRanges).toEqual([
      [0, 3.96],
      [4.21, 6.53],
      [6.78, 11.36],
    ]);
  });

  it("returns clones so a visitor session cannot mutate the canonical fixture", () => {
    const first = getSampleExhibit(nightMarketExhibit.slug);
    first.title = "mutated";
    first.scenes[0].hotspots[0].body = "mutated";

    expect(getSampleExhibit(nightMarketExhibit.slug).title).toBe("Lantern Lane, 1998");
    expect(getSampleExhibit(nightMarketExhibit.slug).scenes[0].hotspots[0].body).not.toBe("mutated");
  });

  it("rejects a human-confirmed claim without an explicit human source", () => {
    const invalid = structuredClone(nightMarketExhibit);
    const claim = invalid.claims.find((item) => item.id === "claim-bicycle-owner");
    if (!claim) throw new Error("Fixture is missing its uncertainty claim.");
    claim.status = "human-confirmed";

    expect(exhibitManifestSchema.safeParse(invalid).success).toBe(false);
  });
});
