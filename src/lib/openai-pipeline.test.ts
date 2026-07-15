import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";

import { exhibitManifestSchema } from "@/lib/exhibit-schema";
import {
  blueprintRequestSchema,
  buildExhibit,
  createBlueprint,
  exhibitBlueprintSchema,
} from "@/lib/openai-pipeline";
import { bicycleRepairExhibit, nightMarketExhibit } from "@/lib/sample-exhibits";

describe("blueprint boundary", () => {
  it("accepts a bounded multimodal packet", () => {
    const parsed = blueprintRequestSchema.parse({
      title: "Saturday at the workshop",
      transcript: "[00:00] We turned the bicycle over before loosening the back wheel.",
      photos: [{ id: "bench-1", label: "The repair bench", dataUrl: "data:image/png;base64,aGVsbG8=" }],
    });

    expect(parsed.photos).toHaveLength(1);
    expect(parsed.live).toBe(true);
  });

  it("rejects executable image formats, duplicate IDs, and unknown fields", () => {
    expect(() =>
      blueprintRequestSchema.parse({
        title: "A title",
        transcript: "A sufficiently long transcript for a custom exhibit packet.",
        photos: [{ id: "x", label: "unsafe", dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }],
      }),
    ).toThrow();
    expect(() =>
      blueprintRequestSchema.parse({
        title: "A title",
        transcript: "A sufficiently long transcript for a custom exhibit packet.",
        photos: [
          { id: "x", label: "one" },
          { id: "x", label: "two" },
        ],
      }),
    ).toThrow();
    expect(() => blueprintRequestSchema.parse({ sampleSlug: nightMarketExhibit.slug, secret: "nope" })).toThrow();
  });

  it("converts the strict blueprint schema to an OpenAI Structured Outputs format", () => {
    expect(() => zodTextFormat(exhibitBlueprintSchema, "keepscape_exhibit_blueprint")).not.toThrow();
  });

  it("falls back deterministically without an API key", async () => {
    const result = await createBlueprint(
      {
        title: "How we fixed the bicycle",
        transcript: "First the bicycle was turned over, then the wheel and chain were repaired.",
        photos: [],
      },
      {},
    );

    expect(result.mode).toBe("demo");
    expect(result.manifest.slug).toBe(bicycleRepairExhibit.slug);
    expect(result.trace.some((entry) => entry.status === "fallback")).toBe(true);
    expect(exhibitManifestSchema.safeParse(result.manifest).success).toBe(true);
  });
});

describe("Codex build boundary", () => {
  it("keeps the typed exhibit fully usable when live Codex is not requested", async () => {
    const result = await buildExhibit({ manifest: bicycleRepairExhibit, live: false }, {});

    expect(result.mode).toBe("demo");
    expect(result.manifest).toEqual(bicycleRepairExhibit);
    expect(result.manifest).not.toBe(bicycleRepairExhibit);
    expect(exhibitManifestSchema.safeParse(result.manifest).success).toBe(true);
  });

  it("honestly reports a fallback when the server guard is disabled", async () => {
    const result = await buildExhibit(
      { manifest: nightMarketExhibit, live: true },
      { KEEPSCAPE_ENABLE_CODEX: "0" },
    );

    expect(result.mode).toBe("demo");
    expect(result.reason).toContain("server-disabled");
    expect(result.trace[0]).toMatchObject({ agent: "Codex", status: "fallback" });
  });
});
