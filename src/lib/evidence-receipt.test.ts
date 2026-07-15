import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { nightMarketExhibit } from "@/lib/sample-exhibits";

describe("checked-in live Codex evidence", () => {
  it("matches the current typed interaction and spatial-plan contract", () => {
    const receipt = JSON.parse(
      readFileSync(resolve(process.cwd(), "docs/evidence/codex-live-run.json"), "utf8"),
    ) as {
      receiptVersion: string;
      mode: string;
      spatialPlan: { enabled: boolean; preset: string; orderedPhotoSourceIds: string[] };
      codexTests: Array<{ name: string; status: string }>;
    };
    const scene = nightMarketExhibit.scenes[0];

    expect(receipt).toMatchObject({ receiptVersion: "1.1", mode: "live" });
    expect(receipt.spatialPlan).toEqual({
      enabled: true,
      preset: "memory-corridor",
      orderedPhotoSourceIds: scene.spatial?.planes.map((plane) => plane.sourceId),
    });
    expect(receipt.codexTests).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Spatial plan allowlist", status: "passed" }),
      expect.objectContaining({ name: "Post-build schema", status: "passed" }),
    ]));
  });
});
