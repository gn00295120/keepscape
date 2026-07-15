import { zodTextFormat } from "openai/helpers/zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { exhibitManifestSchema } from "@/lib/exhibit-schema";
import { applyHumanConfirmations, recordSourceDeskReview } from "@/lib/human-review";
import {
  blueprintRequestSchema,
  BLUEPRINT_INSTRUCTIONS,
  buildRequestSchema,
  buildExhibit,
  compileCodexBuildReport,
  compileBlueprint,
  createOpaqueCodexProjection,
  createBlueprint,
  exhibitBlueprintSchema,
  rebindOpaqueCodexReport,
  type ExhibitBlueprint,
} from "@/lib/openai-pipeline";
import { bicycleRepairExhibit, nightMarketExhibit } from "@/lib/sample-exhibits";

const codexRunMock = vi.hoisted(() => vi.fn());
const codexConstructorMock = vi.hoisted(() => vi.fn());
const codexStartThreadMock = vi.hoisted(() => vi.fn());

vi.mock("@openai/codex-sdk", () => ({
  Codex: class {
    constructor(options: unknown) {
      codexConstructorMock(options);
    }

    startThread(options: unknown) {
      codexStartThreadMock(options);
      return { run: codexRunMock };
    }
  },
}));

const TEST_IMAGE = "data:image/png;base64,aGVsbG8=";
const reviewedNightMarketExhibit = recordSourceDeskReview(
  applyHumanConfirmations(nightMarketExhibit, new Set(["claim-bicycle-owner"])),
  new Set(),
);

function codexReportFor(
  manifest: typeof nightMarketExhibit,
  spatialPlan: {
    enabled: boolean;
    preset: "memory-corridor" | "gallery-arc" | "tabletop";
    orderedPhotoSourceIds: string[];
  },
) {
  const scene = manifest.scenes[0];
  return {
    interaction: {
      kind: scene.interaction.kind,
      hotspotIds:
        scene.interaction.kind === "collect"
          ? scene.interaction.targetHotspotIds
          : scene.interaction.stepHotspotIds,
    },
    spatialPlan,
  };
}

beforeEach(() => {
  codexRunMock.mockReset();
  codexConstructorMock.mockReset();
  codexStartThreadMock.mockReset();
});

describe("blueprint boundary", () => {
  it("accepts a bounded multimodal packet", () => {
    const parsed = blueprintRequestSchema.parse({
      title: "Saturday at the workshop",
      transcript: "[00:00] We turned the bicycle over before loosening the back wheel.",
      photos: [
        { id: "bench-1", label: "The repair bench", dataUrl: TEST_IMAGE },
        { id: "bench-2", label: "The back wheel", dataUrl: TEST_IMAGE },
        { id: "bench-3", label: "The chain", dataUrl: TEST_IMAGE },
      ],
    });

    expect(parsed.photos).toHaveLength(3);
    expect(parsed.live).toBe(true);
    expect(parsed.hasOriginalAudio).toBe(false);
  });

  it("requires three to five real images for a live custom exhibit", () => {
    const base = {
      title: "A title",
      transcript: "A sufficiently long transcript for a custom exhibit packet.",
    };
    expect(() =>
      blueprintRequestSchema.parse({
        ...base,
        photos: [{ id: "one", label: "Only one", dataUrl: TEST_IMAGE }],
      }),
    ).toThrow();
    expect(() =>
      blueprintRequestSchema.parse({
        ...base,
        photos: [
          { id: "one", label: "One", dataUrl: TEST_IMAGE },
          { id: "two", label: "Two", dataUrl: TEST_IMAGE },
          { id: "three", label: "Missing image data" },
        ],
      }),
    ).toThrow(/actual image data/);
    expect(() =>
      blueprintRequestSchema.parse({
        ...base,
        live: false,
        photos: [
          { id: "one", label: "One" },
          { id: "two", label: "Two" },
          { id: "three", label: "Three" },
        ],
      }),
    ).not.toThrow();
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

  it("forbids sensitive inferences from a person's appearance in the live GPT contract", () => {
    expect(BLUEPRINT_INSTRUCTIONS).toContain(
      "Never infer sensitive identity attributes, relationships, diagnoses, or private events from appearance",
    );
  });

  it("rejects duplicate interaction IDs in the GPT blueprint", () => {
    const parsed = exhibitBlueprintSchema.safeParse({
      title: "Three photographs",
      subtitle: "A spatial test fixture",
      dedication: "For deterministic layouts",
      truthNote: "Generated placement is interpretation.",
      stage: "lantern-lane",
      sceneTitle: "A generated room",
      eyebrow: "Three sources",
      narration: "A reviewed narration.",
      claims: [
        { id: "claim-one", text: "One", status: "source-backed", sourceIds: ["photo-one"] },
        { id: "claim-two", text: "Two", status: "source-backed", sourceIds: ["photo-two"] },
        { id: "claim-three", text: "Three", status: "source-backed", sourceIds: ["photo-three"] },
      ],
      hotspots: [
        { id: "one", title: "One", shortLabel: "One", body: "One", xPercent: 20, yPercent: 20, scale: 1, icon: "camera", claimIds: ["claim-one"], sourceIds: ["photo-one"], interpretation: "Generated." },
        { id: "two", title: "Two", shortLabel: "Two", body: "Two", xPercent: 40, yPercent: 40, scale: 1, icon: "camera", claimIds: ["claim-two"], sourceIds: ["photo-two"], interpretation: "Generated." },
        { id: "three", title: "Three", shortLabel: "Three", body: "Three", xPercent: 60, yPercent: 60, scale: 1, icon: "camera", claimIds: ["claim-three"], sourceIds: ["photo-three"], interpretation: "Generated." },
      ],
      interaction: {
        kind: "collect",
        prompt: "Collect them.",
        hotspotIds: ["one", "one", "three"],
        completionMessage: "Done.",
        retryMessage: "Again.",
      },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("must be unique"))).toBe(true);
    }
  });

  it("falls back deterministically without an API key", async () => {
    const result = await createBlueprint(
      {
        title: "How we fixed the bicycle",
        transcript: "First the bicycle was turned over, then the wheel and chain were repaired.",
        photos: [
          { id: "one", label: "One", dataUrl: TEST_IMAGE },
          { id: "two", label: "Two", dataUrl: TEST_IMAGE },
          { id: "three", label: "Three", dataUrl: TEST_IMAGE },
        ],
      },
      {},
    );

    expect(result.mode).toBe("demo");
    expect(result.manifest.slug).toBe(bicycleRepairExhibit.slug);
    expect(result.trace.some((entry) => entry.status === "fallback")).toBe(true);
    expect(exhibitManifestSchema.safeParse(result.manifest).success).toBe(true);
  });

  it("compiles 3–5 uploaded photos into deterministic planes and anchors photo-backed hotspots", () => {
    const blueprint: ExhibitBlueprint = {
      title: "Three photographs",
      subtitle: "A spatial test fixture",
      dedication: "For deterministic layouts",
      truthNote: "Photo placement is generated interpretation, not recovered geometry.",
      stage: "lantern-lane",
      sceneTitle: "A generated room",
      eyebrow: "Three sources",
      narration: "The layout arranges supplied evidence without claiming original depth.",
      claims: [
        { id: "claim-one", text: "The first supplied photo is cited.", status: "source-backed", sourceIds: ["photo-one"] },
        { id: "claim-audio", text: "The supplied transcript is cited.", status: "source-backed", sourceIds: ["story-transcript"] },
        { id: "claim-three", text: "The third supplied photo is cited.", status: "source-backed", sourceIds: ["photo-three"] },
      ],
      hotspots: [
        {
          id: "hotspot-one",
          title: "First photo",
          shortLabel: "One",
          body: "A photo-backed hotspot.",
          xPercent: 43,
          yPercent: 20,
          scale: 1,
          icon: "camera",
          claimIds: ["claim-one"],
          sourceIds: ["photo-one"],
          interpretation: "Its position in the room is generated.",
        },
        {
          id: "hotspot-audio",
          title: "Transcript only",
          shortLabel: "Audio",
          body: "An audio-only hotspot.",
          xPercent: 50,
          yPercent: 50,
          scale: 1,
          icon: "note",
          claimIds: ["claim-audio"],
          sourceIds: ["story-transcript"],
          interpretation: "Its position in the room is generated.",
        },
        {
          id: "hotspot-three",
          title: "Third photo",
          shortLabel: "Three",
          body: "Another photo-backed hotspot.",
          xPercent: 65,
          yPercent: 24,
          scale: 1,
          icon: "camera",
          claimIds: ["claim-three"],
          sourceIds: ["photo-three"],
          interpretation: "Its position in the room is generated.",
        },
      ],
      interaction: {
        kind: "collect",
        prompt: "Visit each supplied memory.",
        hotspotIds: ["hotspot-one", "hotspot-audio", "hotspot-three"],
        completionMessage: "All supplied memories were visited.",
        retryMessage: "Try again.",
      },
    };
    const request = {
      title: "Three photographs",
      transcript: "This transcript is deliberately long enough to satisfy the source boundary.",
      photos: [
        { id: "one", label: "First photo", dataUrl: TEST_IMAGE },
        { id: "two", label: "Second photo", dataUrl: TEST_IMAGE },
        { id: "three", label: "Third photo", dataUrl: TEST_IMAGE },
      ],
      live: true,
      hasOriginalAudio: false,
    };

    const first = compileBlueprint(blueprint, request, "gpt-5.6-test-model");
    const second = compileBlueprint(blueprint, request, "gpt-5.6-test-model");
    const scene = first.scenes[0];

    expect(first).toEqual(second);
    expect(scene.spatial?.planes.map((plane) => [plane.sourceId, plane.slot])).toEqual([
      ["photo-one", "near-left"],
      ["photo-two", "far-center"],
      ["photo-three", "near-right"],
    ]);
    expect(scene.hotspots[0].spatialAnchor).toEqual({ planeId: "plane-photo-one", u: 0.43, v: 0.2 });
    expect(scene.hotspots[1].spatialAnchor).toBeUndefined();
    expect(scene.hotspots[2].spatialAnchor).toEqual({ planeId: "plane-photo-three", u: 0.65, v: 0.24 });
    expect(first.sources.filter((source) => source.kind === "photo").every((source) =>
      source.region?.x === 0 &&
      source.region.y === 0 &&
      source.region.width === 1 &&
      source.region.height === 1,
    )).toBe(true);
    expect(first.sources.find((source) => source.id === "story-transcript")).toMatchObject({
      kind: "human",
      humanRole: "story-note",
    });
    expect(first.claims.find((claim) => claim.id === "claim-audio")?.status).toBe("uncertain");

    const withOriginalAudio = compileBlueprint(
      blueprint,
      { ...request, hasOriginalAudio: true },
      "gpt-5.6-test-model",
    );
    expect(withOriginalAudio.sources.find((source) => source.id === "story-transcript")).toMatchObject({
      kind: "audio",
    });
    expect(withOriginalAudio.sources.find((source) => source.id === "story-transcript")?.timeStartSeconds)
      .toBeUndefined();
    expect(withOriginalAudio.claims.find((claim) => claim.id === "claim-audio")?.status).toBe("uncertain");
    expect(first.buildEvidence.model).toBe("gpt-5.6-test-model");
    expect(exhibitManifestSchema.safeParse(first).success).toBe(true);
  });
});

describe("Codex build boundary", () => {
  it("requires a durable source-desk receipt before any live build", () => {
    expect(() => buildRequestSchema.parse({ manifest: nightMarketExhibit, live: true })).toThrow(/source desk|source-desk|story copy/i);
    expect(() => buildRequestSchema.parse({ manifest: reviewedNightMarketExhibit, live: true })).not.toThrow();

    const spoofedLanguageReceipt = structuredClone(reviewedNightMarketExhibit);
    const languageReceipt = spoofedLanguageReceipt.sources.find(
      (source) => source.id === "human-generated-copy-review",
    );
    if (!languageReceipt) throw new Error("Reviewed fixture is missing its language receipt.");
    languageReceipt.humanRole = "confirmation";
    expect(() => buildRequestSchema.parse({ manifest: spoofedLanguageReceipt, live: true })).toThrow(/story copy/i);

    const preserved = recordSourceDeskReview(nightMarketExhibit, new Set(["claim-bicycle-owner"]));
    const spoofedPreservationReceipt = structuredClone(preserved);
    const preservationReceipt = spoofedPreservationReceipt.sources.find(
      (source) => source.id === "human-preserved-uncertainty-claim-bicycle-owner",
    );
    if (!preservationReceipt) throw new Error("Reviewed fixture is missing its uncertainty receipt.");
    preservationReceipt.humanRole = "confirmation";
    expect(() => buildRequestSchema.parse({ manifest: spoofedPreservationReceipt, live: true })).toThrow(
      /preserved-uncertainty receipt/i,
    );
  });

  it("keeps the typed exhibit fully usable when live Codex is not requested", async () => {
    const result = await buildExhibit({ manifest: bicycleRepairExhibit, live: false }, {});

    expect(result.mode).toBe("demo");
    expect(result.manifest).toEqual(bicycleRepairExhibit);
    expect(result.manifest).not.toBe(bicycleRepairExhibit);
    expect(exhibitManifestSchema.safeParse(result.manifest).success).toBe(true);
  });

  it("honestly reports a fallback when the server guard is disabled", async () => {
    const result = await buildExhibit(
      { manifest: reviewedNightMarketExhibit, live: true },
      { KEEPSCAPE_ENABLE_CODEX: "0" },
    );

    expect(result.mode).toBe("demo");
    expect(result.reason).toContain("server-disabled");
    expect(result.trace[0]).toMatchObject({ agent: "Codex", status: "fallback" });
  });

  it("projects only fixed opaque tokens and enums across the Codex boundary", () => {
    const visitorMarker = "VISITOR_TEXT_MUST_NEVER_REACH_CODEX";
    const visitorManifest = structuredClone(reviewedNightMarketExhibit);
    visitorManifest.title = visitorMarker;
    visitorManifest.sources[0].label = visitorMarker;
    visitorManifest.sources[0].assetPath = visitorMarker;
    visitorManifest.sources[0].excerpt = visitorMarker;
    visitorManifest.claims[0].text = visitorMarker;
    visitorManifest.scenes[0].narration = visitorMarker;
    visitorManifest.scenes[0].hotspots[0].title = visitorMarker;
    const previousHotspotId = visitorManifest.scenes[0].hotspots[0].id;
    visitorManifest.scenes[0].hotspots[0].id = visitorMarker;
    if (visitorManifest.scenes[0].interaction.kind !== "collect") {
      throw new Error("The night-market fixture must use a collect interaction.");
    }
    visitorManifest.scenes[0].interaction.targetHotspotIds =
      visitorManifest.scenes[0].interaction.targetHotspotIds.map((id) =>
        id === previousHotspotId ? visitorMarker : id,
      );
    const parsed = exhibitManifestSchema.parse(visitorManifest);
    const projection = createOpaqueCodexProjection(parsed);
    const serialized = JSON.stringify(projection.packet);

    expect(serialized).not.toContain(visitorMarker);
    for (const hotspot of parsed.scenes[0].hotspots) expect(serialized).not.toContain(hotspot.id);
    for (const plane of parsed.scenes[0].spatial?.planes ?? []) expect(serialized).not.toContain(plane.sourceId);

    const stringValues: string[] = [];
    const visit = (value: unknown) => {
      if (typeof value === "string") stringValues.push(value);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(projection.packet);
    expect(
      stringValues.every(
        (value) =>
          value === "1" ||
          value === "collect" ||
          value === "sequence" ||
          value === "memory-corridor" ||
          value === "gallery-arc" ||
          value === "tabletop" ||
          /^hotspot-[1-6]$/.test(value) ||
          /^photo-[1-5]$/.test(value),
      ),
    ).toBe(true);

    expect(() =>
      rebindOpaqueCodexReport(projection, {
        interaction: { kind: "collect", hotspotTokens: ["hotspot-1", "hotspot-2", "HOST_SECRET"] },
        spatialPlan: {
          enabled: true,
          preset: "memory-corridor",
          orderedPhotoTokens: ["photo-1", "photo-2", "photo-3"],
        },
      }),
    ).toThrow(/opaque hotspot/i);
  });

  it("requires the exact reviewed opaque mechanic and token sets", () => {
    const projection = createOpaqueCodexProjection(reviewedNightMarketExhibit);
    const valid = {
      interaction: {
        kind: "collect" as const,
        hotspotTokens: projection.packet.interaction.orderedHotspotTokens,
      },
      spatialPlan: {
        enabled: true,
        preset: "memory-corridor" as const,
        orderedPhotoTokens: projection.packet.spatialPlan.orderedPhotoTokens,
      },
    };

    expect(() => rebindOpaqueCodexReport(projection, valid)).not.toThrow();
    expect(() =>
      rebindOpaqueCodexReport(projection, {
        ...valid,
        interaction: { ...valid.interaction, kind: "sequence" },
      }),
    ).toThrow(/interaction kind/i);
    expect(() =>
      rebindOpaqueCodexReport(projection, {
        ...valid,
        interaction: {
          ...valid.interaction,
          hotspotTokens: ["hotspot-1", "hotspot-1", "hotspot-3"],
        },
      }),
    ).toThrow(/exactly once/i);
    expect(() =>
      rebindOpaqueCodexReport(projection, {
        ...valid,
        interaction: { ...valid.interaction, hotspotTokens: ["hotspot-1", "hotspot-2"] },
      }),
    ).toThrow();
    expect(() =>
      rebindOpaqueCodexReport(projection, {
        ...valid,
        spatialPlan: {
          ...valid.spatialPlan,
          orderedPhotoTokens: ["photo-1", "photo-1", "photo-3"],
        },
      }),
    ).toThrow(/exactly once/i);
  });

  it("does not let opaque Codex output reorder a reviewed sequence", () => {
    const projection = createOpaqueCodexProjection(bicycleRepairExhibit);
    expect(() =>
      rebindOpaqueCodexReport(projection, {
        interaction: {
          kind: "sequence",
          hotspotTokens: [...projection.packet.interaction.orderedHotspotTokens].reverse(),
        },
        spatialPlan: { enabled: false, preset: "tabletop", orderedPhotoTokens: [] },
      }),
    ).toThrow(/reorder/i);
  });

  it("compiles an allowlisted photo order and preset while rebinding legacy anchors", () => {
    const legacyManifest = structuredClone(nightMarketExhibit);
    const legacySpatial = legacyManifest.scenes[0].spatial;
    if (!legacySpatial) throw new Error("Night market fixture requires a spatial scene.");
    for (const [index, plane] of legacySpatial.planes.entries()) {
      const previousId = plane.id;
      plane.id = `legacy-plane-${index + 1}`;
      for (const hotspot of legacyManifest.scenes[0].hotspots) {
        if (hotspot.spatialAnchor?.planeId === previousId) hotspot.spatialAnchor.planeId = plane.id;
      }
    }
    const parsedLegacyManifest = exhibitManifestSchema.parse(legacyManifest);
    const orderedPhotoSourceIds = [...legacySpatial.planes.map((plane) => plane.sourceId)].reverse();
    const result = compileCodexBuildReport(
      parsedLegacyManifest,
      codexReportFor(parsedLegacyManifest, {
        enabled: true,
        preset: "gallery-arc",
        orderedPhotoSourceIds,
      }),
      "codex-test via Codex SDK",
    );
    const scene = result.manifest.scenes[0];

    expect(scene.spatial?.preset).toBe("gallery-arc");
    expect(scene.spatial?.planes.map((plane) => plane.sourceId)).toEqual(orderedPhotoSourceIds);
    expect(scene.spatial?.planes.map((plane) => plane.slot)).toEqual(["near-left", "far-center", "near-right"]);
    for (const hotspot of scene.hotspots.filter((item) => item.spatialAnchor)) {
      const plane = scene.spatial?.planes.find((item) => item.id === hotspot.spatialAnchor?.planeId);
      expect(plane).toBeDefined();
      expect(hotspot.sourceIds).toContain(plane?.sourceId);
      expect(hotspot.spatialAnchor?.planeId).toMatch(/^plane-/);
    }
    expect(result.manifest.buildEvidence.model).toBe("codex-test via Codex SDK");
    expect(result.manifest.buildEvidence.tests.some((test) => test.name === "Spatial plan allowlist")).toBe(true);
    expect(exhibitManifestSchema.safeParse(result.manifest).success).toBe(true);
  });

  it("preserves every scene after the first scene's Codex build", () => {
    const multiSceneManifest = exhibitManifestSchema.parse({
      ...nightMarketExhibit,
      sources: [...nightMarketExhibit.sources, ...bicycleRepairExhibit.sources],
      claims: [...nightMarketExhibit.claims, ...bicycleRepairExhibit.claims],
      scenes: [nightMarketExhibit.scenes[0], bicycleRepairExhibit.scenes[0]],
    });
    const spatial = multiSceneManifest.scenes[0].spatial;
    if (!spatial) throw new Error("Night market fixture requires a spatial scene.");
    const secondSceneBeforeBuild = structuredClone(multiSceneManifest.scenes[1]);
    const result = compileCodexBuildReport(
      multiSceneManifest,
      codexReportFor(multiSceneManifest, {
        enabled: true,
        preset: "memory-corridor",
        orderedPhotoSourceIds: spatial.planes.map((plane) => plane.sourceId),
      }),
      "codex-test via Codex SDK",
    );

    expect(result.manifest.scenes).toHaveLength(2);
    expect(result.manifest.scenes[1]).toEqual(secondSceneBeforeBuild);
  });

  it.each([
    {
      name: "duplicate",
      sourceIds: ["night-photo-left-lantern", "night-photo-left-lantern", "night-photo-right-lantern"],
      message: /unique|duplicate/i,
    },
    {
      name: "unknown",
      sourceIds: ["night-photo-left-lantern", "night-photo-center-lantern", "missing-photo"],
      message: /unavailable source/i,
    },
    {
      name: "non-photo",
      sourceIds: ["night-photo-left-lantern", "night-photo-center-lantern", "night-audio-lantern"],
      message: /not a photo/i,
    },
    {
      name: "missing",
      sourceIds: ["night-photo-left-lantern", "night-photo-center-lantern"],
      message: /three to five/i,
    },
  ])("rejects a $name spatial source plan", ({ sourceIds, message }) => {
    expect(() =>
      compileCodexBuildReport(
        nightMarketExhibit,
        codexReportFor(nightMarketExhibit, {
          enabled: true,
          preset: "memory-corridor",
          orderedPhotoSourceIds: sourceIds,
        }),
        "codex-test via Codex SDK",
      ),
    ).toThrow(message);
  });

  it("rejects extra photo sources even when they are valid scene members", () => {
    const withExtraPhoto = structuredClone(nightMarketExhibit);
    withExtraPhoto.sources.push({ id: "extra-scene-photo", kind: "photo", label: "Extra scene photo" });
    withExtraPhoto.scenes[0].sourceIds.push("extra-scene-photo");
    const parsed = exhibitManifestSchema.parse(withExtraPhoto);
    const expectedIds = parsed.scenes[0].spatial?.planes.map((plane) => plane.sourceId) ?? [];

    expect(() =>
      compileCodexBuildReport(
        parsed,
        codexReportFor(parsed, {
          enabled: true,
          preset: "memory-corridor",
          orderedPhotoSourceIds: [...expectedIds, "extra-scene-photo"],
        }),
        "codex-test via Codex SDK",
      ),
    ).toThrow(/existing spatial photo sources exactly once/i);
  });

  it("rejects a real photo source that is outside the scene allowlist", () => {
    const withOffScenePhoto = structuredClone(nightMarketExhibit);
    withOffScenePhoto.sources.push({ id: "off-scene-photo", kind: "photo", label: "Off-scene photo" });
    const parsed = exhibitManifestSchema.parse(withOffScenePhoto);

    expect(() =>
      compileCodexBuildReport(
        parsed,
        codexReportFor(parsed, {
          enabled: true,
          preset: "memory-corridor",
          orderedPhotoSourceIds: [
            "night-photo-left-lantern",
            "night-photo-center-lantern",
            "off-scene-photo",
          ],
        }),
        "codex-test via Codex SDK",
      ),
    ).toThrow(/not part of scene/i);
  });

  it("rejects every free-text field from the Codex boundary", () => {
    const spatial = nightMarketExhibit.scenes[0].spatial;
    if (!spatial) throw new Error("Night market fixture requires a spatial scene.");
    const report = codexReportFor(nightMarketExhibit, {
      enabled: true,
      preset: "memory-corridor",
      orderedPhotoSourceIds: spatial.planes.map((plane) => plane.sourceId),
    });

    expect(() =>
      compileCodexBuildReport(
        nightMarketExhibit,
        {
          ...report,
          interaction: {
            ...report.interaction,
            prompt: "Attempted arbitrary model-authored output.",
          },
        },
        "codex-test via Codex SDK",
      ),
    ).toThrow();
  });

  it("does not allow Codex to disable an existing spatial scene", () => {
    expect(() =>
      compileCodexBuildReport(
        nightMarketExhibit,
        codexReportFor(nightMarketExhibit, {
          enabled: false,
          preset: "memory-corridor",
          orderedPhotoSourceIds: [],
        }),
        "codex-test via Codex SDK",
      ),
    ).toThrow(/enabled spatial plan/i);
  });

  it("requires an empty disabled plan for a non-spatial scene", () => {
    const validResult = compileCodexBuildReport(
      bicycleRepairExhibit,
      codexReportFor(bicycleRepairExhibit, {
        enabled: false,
        preset: "tabletop",
        orderedPhotoSourceIds: [],
      }),
      "codex-test via Codex SDK",
    );
    expect(validResult.manifest.scenes[0].spatial).toBeUndefined();
    expect(validResult.manifest.buildEvidence.tests).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Spatial plan allowlist" })]),
    );

    expect(() =>
      compileCodexBuildReport(
        bicycleRepairExhibit,
        codexReportFor(bicycleRepairExhibit, {
          enabled: true,
          preset: "tabletop",
          orderedPhotoSourceIds: bicycleRepairExhibit.sources
            .filter((source) => source.kind === "photo")
            .map((source) => source.id),
        }),
        "codex-test via Codex SDK",
      ),
    ).toThrow(/disable spatial planning/i);

    expect(() =>
      compileCodexBuildReport(
        bicycleRepairExhibit,
        codexReportFor(bicycleRepairExhibit, {
          enabled: false,
          preset: "tabletop",
          orderedPhotoSourceIds: ["repair-photo-bicycle"],
        }),
        "codex-test via Codex SDK",
      ),
    ).toThrow(/return no photo source IDs/i);
  });

  it("returns a live receipt with the validated spatial plan", async () => {
    const spatial = nightMarketExhibit.scenes[0].spatial;
    if (!spatial) throw new Error("Night market fixture requires a spatial scene.");
    const projection = createOpaqueCodexProjection(reviewedNightMarketExhibit);
    const report = codexReportFor(reviewedNightMarketExhibit, {
      enabled: true,
      preset: "gallery-arc",
      orderedPhotoSourceIds: [...spatial.planes.map((plane) => plane.sourceId)].reverse(),
    });
    const opaqueReport = {
      interaction: {
        kind: "collect" as const,
        hotspotTokens: projection.packet.interaction.orderedHotspotTokens,
      },
      spatialPlan: {
        enabled: true,
        preset: "gallery-arc" as const,
        orderedPhotoTokens: [...projection.packet.spatialPlan.orderedPhotoTokens].reverse(),
      },
    };
    codexRunMock.mockImplementationOnce(async () => {
      const threadOptions = codexStartThreadMock.mock.calls[0]?.[0] as { workingDirectory?: string };
      if (!threadOptions.workingDirectory) throw new Error("The Codex test did not receive a workspace.");
      const [{ readFile, readdir }, { join }] = await Promise.all([
        import("node:fs/promises"),
        import("node:path"),
      ]);
      expect(await readdir(threadOptions.workingDirectory)).toEqual(["codex-input.json"]);
      const packet = await readFile(join(threadOptions.workingDirectory, "codex-input.json"), "utf8");
      expect(JSON.parse(packet)).toEqual(projection.packet);
      expect(packet).not.toContain(reviewedNightMarketExhibit.title);
      expect(packet).not.toContain(reviewedNightMarketExhibit.scenes[0].hotspots[0].id);
      expect(packet).not.toContain(reviewedNightMarketExhibit.sources[0].id);
      return { finalResponse: JSON.stringify(opaqueReport) };
    });

    const result = await buildExhibit(
      { manifest: reviewedNightMarketExhibit, live: true },
      { KEEPSCAPE_ENABLE_CODEX: "1", CODEX_MODEL: "codex-test", OPENAI_API_KEY: "test-api-key" },
    );

    expect(result.mode).toBe("live");
    expect(result.manifest.scenes[0].spatial?.preset).toBe("gallery-arc");
    expect(result.manifest.scenes[0].interaction).toEqual(reviewedNightMarketExhibit.scenes[0].interaction);
    expect(result.spatialPlan).toEqual(report.spatialPlan);
    expect(result.trace[0].action).toContain("bounded spatial");
    expect(result.manifest.buildEvidence.tests).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Spatial plan allowlist" })]),
    );
    expect(result.manifest.buildEvidence.generatedFiles).not.toContain("temporary-workspace/build-spec.json");
    const codexOptions = codexConstructorMock.mock.calls[0]?.[0] as {
      apiKey?: string;
      env?: Record<string, string>;
      config?: { shell_environment_policy?: { inherit?: string } };
    };
    expect(codexOptions.apiKey).toBe("test-api-key");
    expect(codexOptions.config?.shell_environment_policy?.inherit).toBe("none");
    expect(codexOptions.env?.CODEX_HOME).toMatch(/keepscape-codex-home-/);
    expect(codexOptions.env?.HOME).toBe(codexOptions.env?.CODEX_HOME);
    expect(codexOptions.env).not.toHaveProperty("OPENAI_API_KEY");
    const threadOptions = codexStartThreadMock.mock.calls[0]?.[0] as { sandboxMode?: string };
    expect(threadOptions.sandboxMode).toBe("read-only");
    const [prompt, runOptions] = codexRunMock.mock.calls[0] as [
      string,
      {
        outputSchema?: {
          properties?: {
            interaction?: {
              properties?: {
                kind?: { enum?: string[] };
                hotspotTokens?: { minItems?: number; maxItems?: number; items?: { enum?: string[] } };
              };
            };
            spatialPlan?: {
              properties?: {
                enabled?: { enum?: boolean[] };
                orderedPhotoTokens?: { minItems?: number; maxItems?: number; items?: { enum?: string[] } };
              };
            };
          };
        };
      },
    ];
    expect(prompt).not.toContain(reviewedNightMarketExhibit.title);
    expect(prompt).not.toContain(reviewedNightMarketExhibit.sources[0].id);
    const interactionSchema = runOptions.outputSchema?.properties?.interaction?.properties;
    expect(interactionSchema?.kind?.enum).toEqual(["collect"]);
    expect(interactionSchema?.hotspotTokens?.items?.enum).toEqual(
      projection.packet.interaction.orderedHotspotTokens,
    );
    expect(interactionSchema?.hotspotTokens?.minItems).toBe(
      projection.packet.interaction.orderedHotspotTokens.length,
    );
    expect(interactionSchema?.hotspotTokens?.maxItems).toBe(
      projection.packet.interaction.orderedHotspotTokens.length,
    );
    const spatialSchema = runOptions.outputSchema?.properties?.spatialPlan?.properties;
    expect(spatialSchema?.enabled?.enum).toEqual([true]);
    expect(spatialSchema?.orderedPhotoTokens?.items?.enum).toEqual(
      projection.packet.spatialPlan.orderedPhotoTokens,
    );
    expect(spatialSchema?.orderedPhotoTokens?.minItems).toBe(
      projection.packet.spatialPlan.orderedPhotoTokens.length,
    );
    expect(JSON.stringify(runOptions.outputSchema)).not.toContain(reviewedNightMarketExhibit.title);
    expect(JSON.stringify(runOptions.outputSchema)).not.toContain(reviewedNightMarketExhibit.sources[0].id);
  });

  it("falls back to the validated manifest when Codex returns an invalid opaque token", async () => {
    const invalidReport = {
      interaction: { kind: "collect", hotspotTokens: ["hotspot-1", "hotspot-2", "HOST_SECRET"] },
      spatialPlan: {
        enabled: true,
        preset: "memory-corridor",
        orderedPhotoTokens: ["photo-1", "photo-2", "photo-3"],
      },
    };
    codexRunMock.mockResolvedValueOnce({ finalResponse: JSON.stringify(invalidReport) });

    const result = await buildExhibit(
      { manifest: reviewedNightMarketExhibit, live: true },
      { KEEPSCAPE_ENABLE_CODEX: "1", CODEX_MODEL: "codex-test", OPENAI_API_KEY: "test-api-key" },
    );

    expect(result.mode).toBe("demo");
    expect(result.reason).toContain("opaque-token Codex build was unavailable");
    expect(result.manifest).toEqual(reviewedNightMarketExhibit);
    expect(result.trace[0]).toMatchObject({ agent: "Codex", status: "fallback" });
  });
});
