import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

  it("builds the night market from three distinct photo views and grounded spatial anchors", () => {
    const photoSources = nightMarketExhibit.sources.filter((source) => source.kind === "photo");
    expect(photoSources.map((source) => [source.assetPath, source.region])).toEqual([
      ["/samples/night-market-left-view.webp", { x: 0.34, y: 0.07, width: 0.18, height: 0.31 }],
      ["/samples/night-market-source-photo.webp", { x: 0.36, y: 0.05, width: 0.26, height: 0.5 }],
      ["/samples/night-market-right-view.webp", { x: 0.57, y: 0.06, width: 0.17, height: 0.32 }],
    ]);

    const spatial = nightMarketExhibit.scenes[0].spatial;
    expect(spatial?.planes.map((plane) => [plane.sourceId, plane.slot])).toEqual([
      ["night-photo-left-lantern", "near-left"],
      ["night-photo-center-lantern", "far-center"],
      ["night-photo-right-lantern", "near-right"],
    ]);
    expect(
      nightMarketExhibit.scenes[0].hotspots
        .filter((hotspot) => hotspot.icon === "lantern")
        .map((hotspot) => hotspot.spatialAnchor),
    ).toEqual([
      { planeId: "plane-night-left-view", u: 0.43, v: 0.2 },
      { planeId: "plane-night-center-view", u: 0.49, v: 0.24 },
      { planeId: "plane-night-right-view", u: 0.65, v: 0.2 },
    ]);
  });

  it("ships every fictional photo asset it cites and labels it as AI-generated", () => {
    const photoSources = sampleExhibits.flatMap((exhibit) =>
      exhibit.sources.filter((source) => source.kind === "photo"),
    );

    for (const source of photoSources) {
      expect(source.label).toMatch(/^AI-generated fictional demo photo · /);
      expect(source.assetPath).toMatch(/^\/samples\/.+\.webp$/);
      expect(existsSync(resolve(process.cwd(), "public", source.assetPath?.slice(1) ?? "missing"))).toBe(true);
    }
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
