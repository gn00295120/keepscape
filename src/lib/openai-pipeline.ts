import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { exhibitManifestSchema, type ExhibitManifest, type Source } from "@/lib/exhibit-schema";
import { GENERATED_COPY_REVIEW_SOURCE_ID, preservedUncertaintySourceId } from "@/lib/human-review";
import { getSampleExhibit, nightMarketExhibit } from "@/lib/sample-exhibits";
import { createPhotoDiorama, createSpatialAnchor } from "@/lib/spatial-layout";

const MAX_TRANSCRIPT_CHARACTERS = 12_000;
const MAX_DATA_URL_CHARACTERS = 7_000_000;
const MAX_TOTAL_IMAGE_CHARACTERS = 24_000_000;

const uniqueBlueprintHotspotIds = z
  .array(z.string().min(1).max(80))
  .min(3)
  .max(6)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Interaction hotspot IDs must be unique." });
    }
  });

const inlineImageSchema = z
  .string()
  .max(MAX_DATA_URL_CHARACTERS, "Each image must be smaller than 5 MB.")
  .regex(
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    "Images must be base64 PNG, JPEG, or WebP data URLs.",
  );

export const blueprintPhotoSchema = z
  .object({
    id: z.string().min(1).max(48).regex(/^[a-zA-Z0-9_-]+$/),
    label: z.string().min(1).max(120),
    dataUrl: inlineImageSchema.optional(),
  })
  .strict();

export const blueprintRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    transcript: z.string().trim().min(20).max(MAX_TRANSCRIPT_CHARACTERS).optional(),
    photos: z.array(blueprintPhotoSchema).max(5).default([]),
    dedication: z.string().trim().min(1).max(180).optional(),
    hasOriginalAudio: z.boolean().default(false),
    sampleSlug: z.string().regex(/^[a-z0-9-]+$/).max(100).optional(),
    live: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    const isCustom = value.title !== undefined || value.transcript !== undefined || value.photos.length > 0;
    if (isCustom && value.title === undefined) {
      context.addIssue({ code: "custom", path: ["title"], message: "A title is required for a custom exhibit." });
    }
    if (isCustom && value.transcript === undefined) {
      context.addIssue({
        code: "custom",
        path: ["transcript"],
        message: "A transcript or story note is required for a custom exhibit.",
      });
    }
    if (isCustom && value.photos.length < 3) {
      context.addIssue({
        code: "custom",
        path: ["photos"],
        message: "A custom exhibit requires three to five photos.",
      });
    }

    const totalImageCharacters = value.photos.reduce((total, photo) => total + (photo.dataUrl?.length ?? 0), 0);
    if (totalImageCharacters > MAX_TOTAL_IMAGE_CHARACTERS) {
      context.addIssue({
        code: "custom",
        path: ["photos"],
        message: "The combined image payload is too large.",
      });
    }

    const ids = new Set<string>();
    for (const [index, photo] of value.photos.entries()) {
      if (ids.has(photo.id)) {
        context.addIssue({
          code: "custom",
          path: ["photos", index, "id"],
          message: "Photo IDs must be unique.",
        });
      }
      ids.add(photo.id);
      if (isCustom && value.live && photo.dataUrl === undefined) {
        context.addIssue({
          code: "custom",
          path: ["photos", index, "dataUrl"],
          message: "Live photo analysis requires the actual image data.",
        });
      }
    }
  });

export const buildRequestSchema = z
  .object({
    manifest: exhibitManifestSchema.optional(),
    sampleSlug: z.string().regex(/^[a-z0-9-]+$/).max(100).optional(),
    live: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.live) return;
    if (!value.manifest) {
      context.addIssue({
        code: "custom",
        path: ["manifest"],
        message: "A live build requires a source-desk-reviewed manifest.",
      });
      return;
    }
    const sourceById = new Map(value.manifest.sources.map((source) => [source.id, source]));
    const languageReview = sourceById.get(GENERATED_COPY_REVIEW_SOURCE_ID);
    if (languageReview?.kind !== "human" || languageReview.humanRole !== "language-review") {
      context.addIssue({
        code: "custom",
        path: ["manifest", "sources"],
        message: "Review the displayed generated story copy at the source desk before a live build.",
      });
    }
    for (const claim of value.manifest.claims) {
      const preservation = sourceById.get(preservedUncertaintySourceId(claim.id));
      if (
        claim.status === "uncertain" &&
        (preservation?.kind !== "human" || preservation.humanRole !== "uncertainty-preserved")
      ) {
        context.addIssue({
          code: "custom",
          path: ["manifest", "claims"],
          message: `Uncertain claim ${claim.id} requires an explicit preserved-uncertainty receipt before build.`,
        });
      }
    }
  });

/**
 * This is deliberately separate from ExhibitManifest. OpenAI Structured Outputs
 * requires every field to be required; the runtime manifest has ergonomic optional
 * fields. We generate a strict blueprint, then compile and validate the manifest.
 */
export const exhibitBlueprintSchema = z
  .object({
    title: z.string().min(1).max(120),
    subtitle: z.string().min(1).max(180),
    dedication: z.string().min(1).max(180),
    truthNote: z.string().min(1).max(500),
    stage: z.enum(["lantern-lane", "repair-bench"]),
    sceneTitle: z.string().min(1).max(120),
    eyebrow: z.string().min(1).max(100),
    narration: z.string().min(1).max(700),
    claims: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            text: z.string().min(1).max(280),
            status: z.enum(["source-backed", "uncertain"]),
            sourceIds: z.array(z.string().min(1).max(80)).min(1).max(5),
          })
          .strict(),
      )
      .min(3)
      .max(8),
    hotspots: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            title: z.string().min(1).max(100),
            shortLabel: z.string().min(1).max(32),
            body: z.string().min(1).max(420),
            xPercent: z.number().min(4).max(96),
            yPercent: z.number().min(8).max(92),
            scale: z.number().min(0.65).max(1.6),
            icon: z.enum(["lantern", "ticket", "camera", "bicycle", "bell", "wrench", "note", "star"]),
            claimIds: z.array(z.string().min(1).max(80)).min(1).max(4),
            sourceIds: z.array(z.string().min(1).max(80)).min(1).max(5),
            interpretation: z.string().min(1).max(300),
          })
          .strict(),
      )
      .min(3)
      .max(6),
    interaction: z
      .object({
        kind: z.enum(["collect", "sequence"]),
        prompt: z.string().min(1).max(220),
        hotspotIds: uniqueBlueprintHotspotIds,
        completionMessage: z.string().min(1).max(280),
        retryMessage: z.string().min(1).max(280),
      })
      .strict(),
  })
  .strict();

export type BlueprintRequest = z.infer<typeof blueprintRequestSchema>;
export type BuildRequest = z.infer<typeof buildRequestSchema>;
export type ExhibitBlueprint = z.infer<typeof exhibitBlueprintSchema>;

export type PipelineTraceEntry = {
  agent: "GPT-5.6" | "Codex" | "Truth gate" | "Typed runtime";
  action: string;
  status: "passed" | "demo" | "fallback";
};

export type PipelineResult = {
  mode: "live" | "demo";
  manifest: ExhibitManifest;
  trace: PipelineTraceEntry[];
  reason?: string;
  blueprint?: ExhibitBlueprint;
  spatialPlan?: {
    enabled: boolean;
    preset: "memory-corridor" | "gallery-arc" | "tabletop";
    orderedPhotoSourceIds: string[];
  };
};

type PipelineEnvironment = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  CODEX_MODEL?: string;
  KEEPSCAPE_ENABLE_CODEX?: string;
};

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "family-memory";
}

function isCustomBlueprintRequest(request: BlueprintRequest): request is BlueprintRequest & {
  title: string;
  transcript: string;
} {
  return request.title !== undefined && request.transcript !== undefined;
}

function buildInputSources(request: BlueprintRequest & { title: string; transcript: string }): Source[] {
  const photoSources: Source[] = request.photos.map((photo) => ({
    id: `photo-${photo.id}`,
    kind: "photo",
    label: photo.label,
    assetPath: photo.dataUrl,
    // Live GPT output does not claim an object-level crop. The whole image is
    // the conservative evidence region and is labeled as a full source view.
    region: { x: 0, y: 0, width: 1, height: 1 },
  }));

  const storySource: Source = request.hasOriginalAudio
    ? {
        id: "story-transcript",
        kind: "audio",
        label: "Storyteller-provided transcript · original recording available locally",
        excerpt: request.transcript,
      }
    : {
        id: "story-transcript",
        kind: "human",
        humanRole: "story-note",
        label: "Storyteller-provided story note · awaits source-desk decision",
        excerpt: request.transcript,
      };

  return [
    ...photoSources,
    storySource,
    {
      id: "human-title",
      kind: "human",
      humanRole: "story-note",
      label: "Storyteller-provided title",
      excerpt: request.title,
    },
    {
      id: "human-story-confirmation",
      kind: "human",
      humanRole: "story-note",
      label: "Storyteller submission note",
      excerpt: "The storyteller supplied this story text and selected material for this exhibit.",
    },
  ];
}

export function compileBlueprint(
  blueprint: ExhibitBlueprint,
  request: BlueprintRequest & { title: string; transcript: string },
  model = "gpt-5.6",
): ExhibitManifest {
  const sources = buildInputSources(request);
  const spatial = createPhotoDiorama(
    sources.filter((source) => source.kind === "photo").map((source) => source.id),
  );
  const spatialPlaneBySourceId = new Map(
    spatial?.planes.map((plane) => [plane.sourceId, plane]) ?? [],
  );
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const claims = blueprint.claims.map((claim) => {
    if (claim.status !== "source-backed") return claim;
    const referencedSources = claim.sourceIds.flatMap((sourceId) => {
      const source = sourceById.get(sourceId);
      return source ? [source] : [];
    });
    const hasLocatedEvidence = referencedSources.some(
      (source) =>
        (source.kind === "photo" && source.region !== undefined) ||
        (source.kind === "audio" && source.timeStartSeconds !== undefined),
    );
    return !hasLocatedEvidence
      ? { ...claim, status: "uncertain" as const }
      : claim;
  });
  const slug = slugify(request.title);
  const interaction =
    blueprint.interaction.kind === "collect"
      ? {
          kind: "collect" as const,
          prompt: blueprint.interaction.prompt,
          targetHotspotIds: blueprint.interaction.hotspotIds,
          completionMessage: blueprint.interaction.completionMessage,
        }
      : {
          kind: "sequence" as const,
          prompt: blueprint.interaction.prompt,
          stepHotspotIds: blueprint.interaction.hotspotIds,
          successMessage: blueprint.interaction.completionMessage,
          retryMessage: blueprint.interaction.retryMessage,
        };

  return exhibitManifestSchema.parse({
    schemaVersion: "1.0",
    id: `exhibit-${slug}`,
    slug,
    title: request.title,
    subtitle: blueprint.subtitle,
    dedication: request.dedication ?? blueprint.dedication,
    truthNote: blueprint.truthNote,
    palette:
      blueprint.stage === "repair-bench"
        ? { ink: "#132821", paper: "#f2eedf", accent: "#df6b35", glow: "#b8db90" }
        : { ink: "#27150f", paper: "#fff1cf", accent: "#df4b2f", glow: "#ffc85c" },
    sources,
    claims,
    scenes: [
      {
        id: `scene-${slug}`,
        title: blueprint.sceneTitle,
        eyebrow: blueprint.eyebrow,
        narration: blueprint.narration,
        stage: blueprint.stage,
        sourceIds: sources.map((source) => source.id),
        hotspots: blueprint.hotspots.map((hotspot) => {
          const photoPlane = hotspot.sourceIds
            .map((sourceId) => spatialPlaneBySourceId.get(sourceId))
            .find((plane) => plane !== undefined);
          return photoPlane
            ? {
                ...hotspot,
                spatialAnchor: createSpatialAnchor(photoPlane.id, hotspot.xPercent, hotspot.yPercent),
              }
            : hotspot;
        }),
        interaction,
        ...(spatial ? { spatial } : {}),
      },
    ],
    buildEvidence: {
      model,
      agents: [
        {
          name: "GPT-5.6 story cartographer",
          role: "Extracted a strict source-linked exhibit blueprint from story text and photo evidence.",
          result: `${blueprint.claims.length} claims, ${blueprint.hotspots.length} hotspots, and 1 interaction proposed.`,
          status: "reviewed",
        },
        {
          name: "Truth gate",
          role: "Resolved every claim, hotspot, and interaction reference against the manifest.",
          result: "The typed manifest passed referential validation.",
          status: "passed",
        },
      ],
      tests: [
        { name: "Manifest schema", detail: "Zod validation and cross-reference checks passed.", status: "passed" },
      ],
      generatedFiles: [`exhibits/${slug}.manifest.json`],
    },
  });
}

function fallbackManifest(request: BlueprintRequest): ExhibitManifest {
  if (request.sampleSlug) return getSampleExhibit(request.sampleSlug);

  const hint = `${request.title ?? ""} ${request.transcript ?? ""}`.toLowerCase();
  return getSampleExhibit(/bike|bicycle|repair|wheel|tire|chain/.test(hint) ? "four-moves-at-the-repair-bench" : undefined);
}

export const BLUEPRINT_INSTRUCTIONS = `You are the source-grounding stage of Keepscape. Turn supplied family material into one compact playable exhibit blueprint.

Non-negotiable truth rules:
- Do not invent a person, relationship, place, object, quote, date, or event.
- Every factual claim and hotspot must cite one or more IDs from AVAILABLE SOURCES.
- A photo supports only what is visible. A transcript or story note supports only what it says.
- A story note without an original recording is a human source, never audio evidence or a fabricated timecode.
- Never infer sensitive identity attributes, relationships, diagnoses, or private events from appearance; omit them even when plausible.
- Use status "uncertain" when the material is ambiguous.
- Never emit "human-confirmed". Only an explicit choice in the source desk can create that state.
- interpretation must plainly label generated scenery, placement, animation, or connective language.
- xPercent and yPercent are generated presentation coordinates only. They are never evidence of where an object appears in a source photo or where photos were relative to each other.
- Never clone a voice, synthesize a deceased person's likeness, or imply that generated scenery is archival.
- Produce 3–6 hotspots and one interaction. Choose collect for independent details; choose sequence only when the supplied story text establishes an order.
- hotspotIds must reference hotspot IDs; claimIds must reference claim IDs.
- Keep the supplied title unless a tiny grammatical correction is essential.
`;

async function createLiveBlueprint(
  request: BlueprintRequest & { title: string; transcript: string },
  environment: PipelineEnvironment,
): Promise<{ blueprint: ExhibitBlueprint; manifest: ExhibitManifest }> {
  const sources = buildInputSources(request);
  const sourceIndex = sources.map((source) => ({ id: source.id, kind: source.kind, label: source.label }));
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "low" }
  > = [
    {
      type: "input_text",
      text: `TITLE\n${request.title}\n\nSTORY TEXT\n${request.transcript}\n\nAVAILABLE SOURCES\n${JSON.stringify(sourceIndex)}`,
    },
  ];

  for (const photo of request.photos) {
    if (!photo.dataUrl) continue;
    content.push({ type: "input_text", text: `Image for source photo-${photo.id}: ${photo.label}` });
    content.push({ type: "input_image", image_url: photo.dataUrl, detail: "low" });
  }

  const client = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
  const response = await client.responses.parse({
    model: environment.OPENAI_MODEL ?? "gpt-5.6",
    instructions: BLUEPRINT_INSTRUCTIONS,
    input: [{ role: "user", content }],
    reasoning: { effort: "high" },
    text: { format: zodTextFormat(exhibitBlueprintSchema, "keepscape_exhibit_blueprint") },
    store: false,
  });
  if (!response.output_parsed) throw new Error("GPT-5.6 returned no parsed blueprint.");

  const blueprint = exhibitBlueprintSchema.parse(response.output_parsed);
  return {
    blueprint,
    manifest: compileBlueprint(blueprint, request, environment.OPENAI_MODEL ?? "gpt-5.6"),
  };
}

export async function createBlueprint(
  input: unknown,
  environment: PipelineEnvironment = process.env as PipelineEnvironment,
): Promise<PipelineResult> {
  const request = blueprintRequestSchema.parse(input);
  const demo = fallbackManifest(request);

  if (!isCustomBlueprintRequest(request)) {
    return {
      mode: "demo",
      manifest: demo,
      reason: "No custom source packet was supplied, so Keepscape loaded a deterministic source-grounded exhibit.",
      trace: [
        { agent: "GPT-5.6", action: "Replay the checked-in story blueprint.", status: "demo" },
        { agent: "Truth gate", action: "Validate every claim and interaction reference.", status: "passed" },
      ],
    };
  }

  if (!request.live || !environment.OPENAI_API_KEY) {
    return {
      mode: "demo",
      manifest: demo,
      reason: !request.live
        ? "Live GPT-5.6 analysis was disabled; showing the closest deterministic exhibit."
        : "OPENAI_API_KEY is not configured; showing the closest deterministic exhibit without exposing credentials.",
      trace: [
        { agent: "GPT-5.6", action: "Analyze story text and images into a structured blueprint.", status: "fallback" },
        { agent: "Truth gate", action: "Load a prevalidated source-grounded manifest.", status: "passed" },
      ],
    };
  }

  try {
    const { blueprint, manifest } = await createLiveBlueprint(request, environment);
    return {
      mode: "live",
      manifest,
      blueprint,
      trace: [
        { agent: "GPT-5.6", action: "Mapped story text and images into a strict structured blueprint.", status: "passed" },
        { agent: "Truth gate", action: "Validated all source, claim, hotspot, and mechanic references.", status: "passed" },
      ],
    };
  } catch {
    return {
      mode: "demo",
      manifest: demo,
      reason: "Live story analysis was unavailable; Keepscape recovered with a deterministic source-grounded exhibit.",
      trace: [
        { agent: "GPT-5.6", action: "Analyze story text and images into a structured blueprint.", status: "fallback" },
        { agent: "Truth gate", action: "Recover with a prevalidated manifest.", status: "passed" },
      ],
    };
  }
}

const codexSpatialPlanSchema = z
  .object({
    enabled: z.boolean(),
    preset: z.enum(["memory-corridor", "gallery-arc", "tabletop"]),
    orderedPhotoSourceIds: z
      .array(z.string().min(1).max(80))
      .max(5)
      .superRefine((sourceIds, context) => {
        if (new Set(sourceIds).size !== sourceIds.length) {
          context.addIssue({ code: "custom", message: "Spatial plan photo source IDs must be unique." });
        }
      }),
  })
  .strict();

const codexBuildReportSchema = z
  .object({
    interaction: z
      .object({
        kind: z.enum(["collect", "sequence"]),
        prompt: z.string().min(1).max(220),
        hotspotIds: z.array(z.string().min(1).max(80)).min(3).max(6),
        completionMessage: z.string().min(1).max(280),
        retryMessage: z.string().min(1).max(280),
      })
      .strict(),
    spatialPlan: codexSpatialPlanSchema,
  })
  .strict();

const CODEX_BUILD_REPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    interaction: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["collect", "sequence"] },
        prompt: { type: "string" },
        hotspotIds: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: { type: "string" },
        },
        completionMessage: { type: "string" },
        retryMessage: { type: "string" },
      },
      required: ["kind", "prompt", "hotspotIds", "completionMessage", "retryMessage"],
      additionalProperties: false,
    },
    spatialPlan: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        preset: { type: "string", enum: ["memory-corridor", "gallery-arc", "tabletop"] },
        orderedPhotoSourceIds: {
          type: "array",
          maxItems: 5,
          items: { type: "string" },
        },
      },
      required: ["enabled", "preset", "orderedPhotoSourceIds"],
      additionalProperties: false,
    },
  },
  required: ["interaction", "spatialPlan"],
  additionalProperties: false,
} as const;

function redactInlineAssets(manifest: ExhibitManifest): string {
  return JSON.stringify(
    manifest,
    (key, value: unknown) =>
      key === "assetPath" && typeof value === "string" && value.startsWith("data:")
        ? "[inline image retained by the typed runtime]"
        : value,
    2,
  );
}

export function compileCodexBuildReport(
  manifestInput: ExhibitManifest,
  reportInput: unknown,
  model: string,
) {
  const manifest = exhibitManifestSchema.parse(manifestInput);
  const report = codexBuildReportSchema.parse(reportInput);
  const scene = manifest.scenes[0];
  const availableHotspotIds = new Set(scene.hotspots.map((hotspot) => hotspot.id));
  const selectedHotspotIds = report.interaction.hotspotIds;
  if (
    new Set(selectedHotspotIds).size !== selectedHotspotIds.length ||
    selectedHotspotIds.some((hotspotId) => !availableHotspotIds.has(hotspotId))
  ) {
    throw new Error("Codex interaction referenced unavailable or duplicate hotspots.");
  }

  const compiledInteraction =
    report.interaction.kind === "collect"
      ? {
          kind: "collect" as const,
          prompt: report.interaction.prompt,
          targetHotspotIds: selectedHotspotIds,
          completionMessage: report.interaction.completionMessage,
        }
      : {
          kind: "sequence" as const,
          prompt: report.interaction.prompt,
          stepHotspotIds: selectedHotspotIds,
          successMessage: report.interaction.completionMessage,
          retryMessage: report.interaction.retryMessage,
        };

  const orderedPhotoSourceIds = report.spatialPlan.orderedPhotoSourceIds;
  let compiledSpatial = scene.spatial;
  let compiledHotspots = scene.hotspots;
  let spatialPlanDetail: string;

  if (!scene.spatial) {
    if (report.spatialPlan.enabled || orderedPhotoSourceIds.length !== 0) {
      throw new Error("Codex must disable spatial planning for a non-spatial scene and return no photo source IDs.");
    }
    spatialPlanDetail = "The non-spatial scene explicitly returned an empty, disabled spatial plan.";
  } else {
    if (!report.spatialPlan.enabled) {
      throw new Error("Codex must return an enabled spatial plan for the existing spatial scene.");
    }
    if (orderedPhotoSourceIds.length < 3 || orderedPhotoSourceIds.length > 5) {
      throw new Error("Codex spatial plans require three to five photo source IDs.");
    }
    if (new Set(orderedPhotoSourceIds).size !== orderedPhotoSourceIds.length) {
      throw new Error("Codex spatial plan referenced duplicate photo source IDs.");
    }

    const sourceById = new Map(manifest.sources.map((source) => [source.id, source]));
    for (const sourceId of orderedPhotoSourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) throw new Error(`Codex spatial plan referenced unavailable source ${sourceId}.`);
      if (source.kind !== "photo") {
        throw new Error(`Codex spatial plan source ${sourceId} is not a photo.`);
      }
      if (!scene.sourceIds.includes(sourceId)) {
        throw new Error(`Codex spatial plan source ${sourceId} is not part of scene ${scene.id}.`);
      }
    }

    const expectedPhotoSourceIds = scene.spatial.planes.map((plane) => plane.sourceId);
    const expectedPhotoSourceIdSet = new Set(expectedPhotoSourceIds);
    if (
      orderedPhotoSourceIds.length !== expectedPhotoSourceIds.length ||
      orderedPhotoSourceIds.some((sourceId) => !expectedPhotoSourceIdSet.has(sourceId))
    ) {
      throw new Error("Codex spatial plan must contain the existing spatial photo sources exactly once.");
    }

    const nextSpatial = createPhotoDiorama(orderedPhotoSourceIds, report.spatialPlan.preset);
    if (!nextSpatial) throw new Error("Codex spatial plan could not be compiled into a bounded preset.");
    const previousPlaneById = new Map(scene.spatial.planes.map((plane) => [plane.id, plane]));
    const nextPlaneBySourceId = new Map(nextSpatial.planes.map((plane) => [plane.sourceId, plane]));
    compiledHotspots = scene.hotspots.map((hotspot) => {
      if (!hotspot.spatialAnchor) return hotspot;
      const previousPlane = previousPlaneById.get(hotspot.spatialAnchor.planeId);
      if (!previousPlane || !hotspot.sourceIds.includes(previousPlane.sourceId)) {
        throw new Error(`Hotspot ${hotspot.id} has an invalid pre-build spatial anchor.`);
      }
      const nextPlane = nextPlaneBySourceId.get(previousPlane.sourceId);
      if (!nextPlane) {
        throw new Error(`Codex spatial plan omitted the cited photo for hotspot ${hotspot.id}.`);
      }
      return {
        ...hotspot,
        spatialAnchor: { ...hotspot.spatialAnchor, planeId: nextPlane.id },
      };
    });
    compiledSpatial = nextSpatial;
    spatialPlanDetail = `${orderedPhotoSourceIds.length} distinct photo sources resolve in scene ${scene.id}; canonical ${report.spatialPlan.preset} slots were applied in this order: ${orderedPhotoSourceIds.join(" → ")}.`;
  }

  const builtManifest = exhibitManifestSchema.parse({
    ...manifest,
    scenes: manifest.scenes.map((manifestScene, index) =>
      index === 0
        ? {
            ...manifestScene,
            hotspots: compiledHotspots,
            interaction: compiledInteraction,
            ...(compiledSpatial ? { spatial: compiledSpatial } : {}),
          }
        : manifestScene,
    ),
    buildEvidence: {
      model,
      agents: [
        ...manifest.buildEvidence.agents,
        {
          name: "Codex interaction and spatial builder",
          role: report.spatialPlan.enabled
            ? "Created the story-specific typed mechanic and a bounded spatial plan in an isolated, no-network workspace."
            : "Created the story-specific typed mechanic and explicitly disabled spatial planning for the non-spatial scene.",
          result: report.spatialPlan.enabled
            ? `The host compiled a ${report.interaction.kind} interaction over ${selectedHotspotIds.length} existing hotspots and applied the allowlisted ${report.spatialPlan.preset} preset.`
            : `The host compiled a ${report.interaction.kind} interaction over ${selectedHotspotIds.length} existing hotspots with spatial planning disabled.`,
          status: "passed" as const,
        },
        {
          name: "Codex output allowlist",
          role: "Host-validated the bounded Codex output without trusting model-authored receipt prose.",
          result: `All ${selectedHotspotIds.length} interaction IDs and ${orderedPhotoSourceIds.length} spatial photo IDs resolved uniquely against the input manifest.`,
          status: "passed" as const,
        },
      ],
      tests: [
        ...manifest.buildEvidence.tests,
        {
          name: "Codex interaction compile",
          detail: `The host compiled one ${report.interaction.kind} mechanic from ${selectedHotspotIds.length} distinct allowlisted hotspot IDs.`,
          status: "passed" as const,
        },
        {
          name: "Hotspot allowlist",
          detail: `${selectedHotspotIds.length} distinct generated interaction references resolve in the scene.`,
          status: "passed" as const,
        },
        { name: "Spatial plan allowlist", detail: spatialPlanDetail, status: "passed" as const },
        {
          name: "Post-build schema",
          detail: "The final manifest passed Zod and referential checks.",
          status: "passed" as const,
        },
      ],
      generatedFiles: manifest.buildEvidence.generatedFiles,
    },
  });

  return { manifest: builtManifest, report };
}

function demoBuildResult(manifest: ExhibitManifest, reason: string): PipelineResult {
  return {
    mode: "demo",
    manifest: structuredClone(manifest),
    reason,
    trace: [
      { agent: "Codex", action: "Compile and review the story-specific interaction.", status: "fallback" },
      { agent: "Typed runtime", action: "Render the already validated manifest without executing generated code.", status: "passed" },
    ],
  };
}

export async function buildExhibit(
  input: unknown,
  environment: PipelineEnvironment = process.env as PipelineEnvironment,
): Promise<PipelineResult> {
  const request = buildRequestSchema.parse(input);
  const manifest = exhibitManifestSchema.parse(request.manifest ?? getSampleExhibit(request.sampleSlug));

  if (!request.live) {
    return demoBuildResult(manifest, "Live Codex build was not requested; the deterministic typed runtime remains fully usable.");
  }
  if (environment.KEEPSCAPE_ENABLE_CODEX !== "1") {
    return demoBuildResult(
      manifest,
      "Live Codex build is server-disabled; the deterministic typed runtime remains fully usable.",
    );
  }

  const cleanupRoots: string[] = [];
  try {
    const [{ chmod, copyFile, mkdtemp, writeFile }, { homedir, tmpdir }, { join }, { Codex }] = await Promise.all([
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
      import("@openai/codex-sdk"),
    ]);
    const workspace = await mkdtemp(join(tmpdir(), "keepscape-codex-"));
    const isolatedCodexHome = await mkdtemp(join(tmpdir(), "keepscape-codex-home-"));
    cleanupRoots.push(workspace, isolatedCodexHome);
    await chmod(isolatedCodexHome, 0o700);

    if (!environment.OPENAI_API_KEY) {
      const signedInCodexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
      await copyFile(join(signedInCodexHome, "auth.json"), join(isolatedCodexHome, "auth.json"));
      await chmod(join(isolatedCodexHome, "auth.json"), 0o600);
    }

    await writeFile(join(workspace, "manifest.json"), redactInlineAssets(manifest), { encoding: "utf8", mode: 0o600 });
    const codex = new Codex({
      ...(environment.OPENAI_API_KEY ? { apiKey: environment.OPENAI_API_KEY } : {}),
      env: {
        CODEX_HOME: isolatedCodexHome,
        HOME: isolatedCodexHome,
        PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
        LANG: process.env.LANG ?? "C.UTF-8",
        LC_ALL: process.env.LC_ALL ?? process.env.LANG ?? "C.UTF-8",
        TMPDIR: tmpdir(),
      },
      config: {
        shell_environment_policy: { inherit: "none" },
      },
    });
    const thread = codex.startThread({
      workingDirectory: workspace,
      skipGitRepoCheck: true,
      ...(environment.CODEX_MODEL ? { model: environment.CODEX_MODEL } : {}),
      modelReasoningEffort: "high",
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      webSearchMode: "disabled",
    });
    const turn = await thread.run(
      `Act as Keepscape's isolated interaction and spatial-plan builder. Read manifest.json and CREATE or refine its first scene's typed interaction using only existing hotspot IDs. Choose collect for independent evidence and sequence only when source material establishes order. If the first scene already has a spatial plan, return spatialPlan.enabled=true, select one allowlisted preset, and list every existing spatial plane photo source ID exactly once in the intended display order. If it has no spatial plan, return enabled=false and an empty orderedPhotoSourceIds array. Never invent, omit, or duplicate source IDs. Do not change claims, add factual story content, execute visitor code, or access the network. Prompt and completion copy must describe interaction state without asserting new story facts. Return only the complete typed interaction and required spatial plan.`,
      { outputSchema: CODEX_BUILD_REPORT_JSON_SCHEMA },
    );
    const { manifest: builtManifest, report } = compileCodexBuildReport(
      manifest,
      JSON.parse(turn.finalResponse),
      `${environment.CODEX_MODEL ?? "Codex account default"} via Codex SDK`,
    );

    return {
      mode: "live",
      manifest: builtManifest,
      spatialPlan: report.spatialPlan,
      trace: [
        {
          agent: "Codex",
          action: report.spatialPlan.enabled
            ? "Created a typed interaction and bounded spatial plan in an isolated no-network workspace."
            : "Created a typed interaction and explicitly returned an empty spatial plan for the non-spatial scene.",
          status: "passed",
        },
        {
          agent: "Truth gate",
          action: report.spatialPlan.enabled
            ? "Allowlisted every hotspot and spatial photo source, rebuilt canonical slots, and revalidated the manifest."
            : "Allowlisted every hotspot, verified the disabled spatial plan, and revalidated the manifest.",
          status: "passed",
        },
        {
          agent: "Typed runtime",
          action: report.spatialPlan.enabled
            ? "Prepared the schema-safe interaction and spatial preset for rendering."
            : "Prepared the schema-safe non-spatial interaction for rendering.",
          status: "passed",
        },
      ],
    };
  } catch {
    return demoBuildResult(
      manifest,
      "The isolated Codex build was unavailable; Keepscape recovered with the validated typed runtime.",
    );
  } finally {
    const { rm } = await import("node:fs/promises");
    await Promise.all(cleanupRoots.map((root) => rm(root, { recursive: true, force: true }).catch(() => undefined)));
  }
}

export const defaultSampleSlug = nightMarketExhibit.slug;
