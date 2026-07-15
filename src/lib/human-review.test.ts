import { describe, expect, it } from "vitest";

import { exhibitManifestSchema } from "@/lib/exhibit-schema";
import { applyHumanConfirmations } from "@/lib/human-review";
import { nightMarketExhibit } from "@/lib/sample-exhibits";

describe("human source review", () => {
  it("converts an explicit confirmation into durable, visible provenance", () => {
    const reviewed = applyHumanConfirmations(
      nightMarketExhibit,
      new Set(["claim-bicycle-owner"]),
    );
    const claim = reviewed.claims.find((item) => item.id === "claim-bicycle-owner");
    const sourceId = "human-confirmation-claim-bicycle-owner";

    expect(claim?.status).toBe("human-confirmed");
    expect(claim?.sourceIds).toContain(sourceId);
    expect(reviewed.sources.find((source) => source.id === sourceId)?.kind).toBe("human");
    expect(reviewed.scenes[0].sourceIds).toContain(sourceId);
    expect(reviewed.scenes[0].hotspots.find((hotspot) => hotspot.id === "hotspot-bicycle-bell")?.sourceIds)
      .toContain(sourceId);
    expect(exhibitManifestSchema.safeParse(reviewed).success).toBe(true);
  });

  it("leaves preserved or unconfirmed uncertainty unchanged", () => {
    const reviewed = applyHumanConfirmations(nightMarketExhibit, new Set());
    const claim = reviewed.claims.find((item) => item.id === "claim-bicycle-owner");

    expect(claim?.status).toBe("uncertain");
    expect(reviewed).not.toBe(nightMarketExhibit);
  });
});
