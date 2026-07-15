import { describe, expect, it } from "vitest";

import { exhibitManifestSchema } from "@/lib/exhibit-schema";
import {
  applyHumanConfirmations,
  recordInteractionCopyReview,
  recordSourceDeskReview,
} from "@/lib/human-review";
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
    expect(reviewed.sources.find((source) => source.id === sourceId)).toMatchObject({
      kind: "human",
      humanRole: "confirmation",
      confirmedClaimId: "claim-bicycle-owner",
    });
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

  it("records the required human review of generated narrative copy exactly once", () => {
    const reviewed = recordSourceDeskReview(nightMarketExhibit, new Set(["claim-bicycle-owner"]));
    const reviewedAgain = recordSourceDeskReview(reviewed, new Set(["claim-bicycle-owner"]));

    expect(reviewed.sources.find((source) => source.id === "human-generated-copy-review")).toMatchObject({
      kind: "human",
      humanRole: "language-review",
    });
    expect(
      reviewed.sources.find((source) => source.id === "human-preserved-uncertainty-claim-bicycle-owner"),
    ).toMatchObject({ kind: "human", humanRole: "uncertainty-preserved" });
    expect(reviewed.scenes[0].sourceIds).toContain("human-generated-copy-review");
    expect(reviewed.scenes[0].hotspots.find((hotspot) => hotspot.id === "hotspot-bicycle-bell")?.sourceIds)
      .toContain("human-preserved-uncertainty-claim-bicycle-owner");
    expect(reviewed.buildEvidence.tests.some((test) => test.name === "Generated-language gate")).toBe(true);
    expect(reviewedAgain.sources.filter((source) => source.id === "human-generated-copy-review")).toHaveLength(1);
    expect(exhibitManifestSchema.safeParse(reviewedAgain).success).toBe(true);
  });

  it("refuses to record a source-desk receipt while an uncertainty has no human decision", () => {
    expect(() => recordSourceDeskReview(nightMarketExhibit, new Set())).toThrow(/missing a decision/);
  });

  it("records final Codex interaction-language approval exactly once", () => {
    const sourceReviewed = recordSourceDeskReview(
      applyHumanConfirmations(nightMarketExhibit, new Set(["claim-bicycle-owner"])),
      new Set(),
    );
    const reviewed = recordInteractionCopyReview(sourceReviewed);
    const reviewedAgain = recordInteractionCopyReview(reviewed);

    expect(reviewed.sources.find((source) => source.id === "human-interaction-copy-review")).toMatchObject({
      kind: "human",
      humanRole: "language-review",
    });
    expect(reviewed.scenes[0].sourceIds).toContain("human-interaction-copy-review");
    expect(reviewed.buildEvidence.tests.some((test) => test.name === "Final interaction-language gate")).toBe(true);
    expect(reviewedAgain.sources.filter((source) => source.id === "human-interaction-copy-review")).toHaveLength(1);
    expect(exhibitManifestSchema.safeParse(reviewedAgain).success).toBe(true);
  });
});
