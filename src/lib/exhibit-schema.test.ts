import { describe, expect, it } from "vitest";

import { exhibitManifestSchema, normalizedRegionSchema } from "@/lib/exhibit-schema";
import { bicycleRepairExhibit, nightMarketExhibit } from "@/lib/sample-exhibits";

describe("exhibit spatial schema", () => {
  it("keeps schemaVersion 1.0 manifests without spatial data valid", () => {
    expect(bicycleRepairExhibit.schemaVersion).toBe("1.0");
    expect(bicycleRepairExhibit.scenes[0].spatial).toBeUndefined();
    expect(exhibitManifestSchema.safeParse(bicycleRepairExhibit).success).toBe(true);
  });

  it("rejects normalized regions that extend beyond the source image", () => {
    expect(normalizedRegionSchema.safeParse({ x: 0.8, y: 0, width: 0.3, height: 1 }).success).toBe(false);
    expect(normalizedRegionSchema.safeParse({ x: 0, y: 0.8, width: 1, height: 0.3 }).success).toBe(false);
    expect(normalizedRegionSchema.safeParse({ x: 0.8, y: 0.8, width: 0.2, height: 0.2 }).success).toBe(true);
  });

  it("requires typed human roles and a real locator for source-backed claims", () => {
    const missingHumanRole = structuredClone(nightMarketExhibit);
    delete missingHumanRole.sources.find((source) => source.id === "night-human-date")?.humanRole;
    expect(exhibitManifestSchema.safeParse(missingHumanRole).success).toBe(false);

    const photoWithoutRegion = structuredClone(nightMarketExhibit);
    const leftPhoto = photoWithoutRegion.sources.find((source) => source.id === "night-photo-left-lantern");
    if (!leftPhoto) throw new Error("Night fixture is missing its left photo.");
    delete leftPhoto.region;
    const leftClaim = photoWithoutRegion.claims.find((claim) => claim.id === "claim-left-lantern");
    if (!leftClaim) throw new Error("Night fixture is missing its left-photo claim.");
    leftClaim.sourceIds = [leftPhoto.id];
    const photoResult = exhibitManifestSchema.safeParse(photoWithoutRegion);
    expect(photoResult.success).toBe(false);
    if (!photoResult.success) {
      expect(photoResult.error.issues.some((issue) => issue.message.includes("photo region or audio timecode")))
        .toBe(true);
    }

    const audioWithoutTimecode = structuredClone(nightMarketExhibit);
    const ticketAudio = audioWithoutTimecode.sources.find((source) => source.id === "night-audio-ticket");
    if (!ticketAudio) throw new Error("Night fixture is missing its ticket audio.");
    delete ticketAudio.timeStartSeconds;
    delete ticketAudio.timeEndSeconds;
    const audioResult = exhibitManifestSchema.safeParse(audioWithoutTimecode);
    expect(audioResult.success).toBe(false);
    if (!audioResult.success) {
      expect(audioResult.error.issues.some((issue) => issue.message.includes("photo region or audio timecode")))
        .toBe(true);
    }
  });

  it("does not let a language or uncertainty review masquerade as factual confirmation", () => {
    for (const humanRole of ["language-review", "uncertainty-preserved"] as const) {
      const invalid = structuredClone(nightMarketExhibit);
      const confirmation = invalid.sources.find((source) => source.id === "night-human-date");
      if (!confirmation) throw new Error("Night fixture is missing its human confirmation.");
      confirmation.humanRole = humanRole;

      const result = exhibitManifestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.message.includes("human confirmation source"))).toBe(true);
      }
    }
  });

  it("binds each human confirmation receipt to its exact claim", () => {
    const wrongClaim = structuredClone(nightMarketExhibit);
    const confirmation = wrongClaim.sources.find((source) => source.id === "night-human-date");
    if (!confirmation) throw new Error("Night fixture is missing its human confirmation.");
    confirmation.confirmedClaimId = "claim-left-lantern";

    const result = exhibitManifestSchema.safeParse(wrongClaim);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("exact human-confirmed claim"))).toBe(true);
    }
  });

  it("rejects duplicate plane IDs", () => {
    const invalid = structuredClone(nightMarketExhibit);
    const spatial = invalid.scenes[0].spatial;
    if (!spatial) throw new Error("Night market fixture is missing its spatial layout.");
    spatial.planes[1].id = spatial.planes[0].id;

    const result = exhibitManifestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("Spatial plane ID"))).toBe(true);
    }
  });

  it("requires each spatial plane to use an existing photo source from its scene", () => {
    const nonPhoto = structuredClone(nightMarketExhibit);
    const spatial = nonPhoto.scenes[0].spatial;
    if (!spatial) throw new Error("Night market fixture is missing its spatial layout.");
    spatial.planes[0].sourceId = "night-audio-lantern";

    const nonPhotoResult = exhibitManifestSchema.safeParse(nonPhoto);
    expect(nonPhotoResult.success).toBe(false);
    if (!nonPhotoResult.success) {
      expect(nonPhotoResult.error.issues.some((issue) => issue.message.includes("requires a photo source"))).toBe(true);
    }

    const missing = structuredClone(nightMarketExhibit);
    const missingSpatial = missing.scenes[0].spatial;
    if (!missingSpatial) throw new Error("Night market fixture is missing its spatial layout.");
    missingSpatial.planes[0].sourceId = "missing-photo";

    const missingResult = exhibitManifestSchema.safeParse(missing);
    expect(missingResult.success).toBe(false);
    if (!missingResult.success) {
      expect(missingResult.error.issues.some((issue) => issue.message.includes("references missing source"))).toBe(true);
      expect(missingResult.error.issues.some((issue) => issue.message.includes("omits spatial plane source"))).toBe(true);
    }

    const omitted = structuredClone(nightMarketExhibit);
    omitted.sources.push({
      id: "unlisted-photo",
      kind: "photo",
      label: "A photo intentionally omitted from the scene",
      region: { x: 0, y: 0, width: 1, height: 1 },
    });
    const omittedSpatial = omitted.scenes[0].spatial;
    if (!omittedSpatial) throw new Error("Night market fixture is missing its spatial layout.");
    omittedSpatial.planes[0].sourceId = "unlisted-photo";

    const omittedResult = exhibitManifestSchema.safeParse(omitted);
    expect(omittedResult.success).toBe(false);
    if (!omittedResult.success) {
      expect(omittedResult.error.issues.some((issue) => issue.message.includes("omits spatial plane source"))).toBe(true);
    }
  });

  it("rejects missing anchor planes without requiring anchors for audio-only hotspots", () => {
    const scene = nightMarketExhibit.scenes[0];
    const audioOnlyHotspots = scene.hotspots.filter((hotspot) =>
      hotspot.sourceIds.every((sourceId) => scene.spatial?.planes.every((plane) => plane.sourceId !== sourceId)),
    );
    expect(audioOnlyHotspots.length).toBeGreaterThan(0);
    expect(audioOnlyHotspots.every((hotspot) => hotspot.spatialAnchor === undefined)).toBe(true);

    const invalid = structuredClone(nightMarketExhibit);
    invalid.scenes[0].hotspots[0].spatialAnchor = { planeId: "missing-plane", u: 0.5, v: 0.5 };
    const result = exhibitManifestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("missing spatial plane"))).toBe(true);
    }
  });

  it("rejects reused plane slots and anchors that are not cited by the hotspot", () => {
    const reusedSlot = structuredClone(nightMarketExhibit);
    const spatial = reusedSlot.scenes[0].spatial;
    if (!spatial) throw new Error("Night market fixture is missing its spatial layout.");
    spatial.planes[1].slot = spatial.planes[0].slot;
    expect(exhibitManifestSchema.safeParse(reusedSlot).success).toBe(false);

    const uncitedAnchor = structuredClone(nightMarketExhibit);
    uncitedAnchor.scenes[0].hotspots[0].spatialAnchor = {
      planeId: "plane-night-right-view",
      u: 0.5,
      v: 0.5,
    };
    const result = exhibitManifestSchema.safeParse(uncitedAnchor);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("cited photo sources"))).toBe(true);
    }
  });

  it("rejects duplicate interaction hotspot IDs before they can create an unbeatable activity", () => {
    const duplicateCollectTarget = structuredClone(nightMarketExhibit);
    const interaction = duplicateCollectTarget.scenes[0].interaction;
    if (interaction.kind !== "collect") throw new Error("Night market fixture must use collect.");
    interaction.targetHotspotIds = [
      interaction.targetHotspotIds[0],
      interaction.targetHotspotIds[0],
      interaction.targetHotspotIds[1],
    ];

    const result = exhibitManifestSchema.safeParse(duplicateCollectTarget);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("must be unique"))).toBe(true);
    }
  });
});
