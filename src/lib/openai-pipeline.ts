import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { exhibitManifestSchema, type ExhibitManifest, type Source } from "@/lib/exhibit-schema";
import { getSampleExhibit, nightMarketExhibit } from "@/lib/sample-exhibits";

const MAX_TRANSCRIPT_CHARACTERS = 12_000;
const MAX_DATA_URL_CHARACTERS = 7_000_000;
const MAX_TOTAL_IMAGE_CHARACTERS = 24_000_000;

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
        message: "A transcript is required for a custom exhibit.",
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
    }
  });

export const buildRequestSchema = z
  .object({
    manifest: exhibitManifestSchema.optional(),
    sampleSlug: z.string().regex(/^[a-z0-9-]+$/).max(100).optional(),
    live: z.boolean().default(false),
  })
  .strict();

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
        hotspotIds: z.array(z.string().min(1).max(80)).min(3).max(6),
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
    region: { x: 0, y: 0, width: 1, height: 1 },
  }));

  return [
    ...photoSources,
    {
      id: "story-transcript",
      kind: "audio",
      label: "Storyteller-provided transcript · starts at 00:00",
      timeStartSeconds: 0,
      excerpt: request.transcript,
    },
    {
      id: "human-title",
      kind: "human",
      label: "Storyteller title confirmation",
      excerpt: request.title,
    },
    {
      id: "human-story-confirmation",
      kind: "human",
      label: "Storyteller submission confirmation",
      excerpt: "The storyteller supplied this transcript and selected material for this exhibit.",
    },
  ];
}

function compileBlueprint(
  blueprint: ExhibitBlueprint,
  request: BlueprintRequest & { title: string; transcript: string },
): ExhibitManifest {
  const sources = buildInputSources(request);
  const slug = slugify(blueprint.title);
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
    title: blueprint.title,
    subtitle: blueprint.subtitle,
    dedication: request.dedication ?? blueprint.dedication,
    truthNote: blueprint.truthNote,
    palette:
      blueprint.stage === "repair-bench"
        ? { ink: "#132821", paper: "#f2eedf", accent: "#df6b35", glow: "#b8db90" }
        : { ink: "#27150f", paper: "#fff1cf", accent: "#df4b2f", glow: "#ffc85c" },
    sources,
    claims: blueprint.claims,
    scenes: [
      {
        id: `scene-${slug}`,
        title: blueprint.sceneTitle,
        eyebrow: blueprint.eyebrow,
        narration: blueprint.narration,
        stage: blueprint.stage,
        sourceIds: sources.map((source) => source.id),
        hotspots: blueprint.hotspots,
        interaction,
      },
    ],
    buildEvidence: {
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      agents: [
        {
          name: "GPT-5.6 story cartographer",
          role: "Extracted a strict source-linked exhibit blueprint from transcript and photo evidence.",
          result: `${blueprint.claims.length} claims and ${blueprint.hotspots.length} interactions proposed.`,
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

const BLUEPRINT_INSTRUCTIONS = `You are the source-grounding stage of Keepscape. Turn supplied family material into one compact playable exhibit blueprint.

Non-negotiable truth rules:
- Do not invent a person, relationship, place, object, quote, date, or event.
- Every factual claim and hotspot must cite one or more IDs from AVAILABLE SOURCES.
- A photo supports only what is visible. A transcript supports only what it says.
- Use status "uncertain" when the material is ambiguous.
- Never emit "human-confirmed". Only an explicit choice in the source desk can create that state.
- interpretation must plainly label generated scenery, placement, animation, or connective language.
- Never clone a voice, synthesize a deceased person's likeness, or imply that generated scenery is archival.
- Produce 3–6 hotspots and one interaction. Choose collect for independent details; choose sequence only when the transcript establishes an order.
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
      text: `TITLE\n${request.title}\n\nTRANSCRIPT\n${request.transcript}\n\nAVAILABLE SOURCES\n${JSON.stringify(sourceIndex)}`,
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
  return { blueprint, manifest: compileBlueprint(blueprint, request) };
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
        { agent: "GPT-5.6", action: "Analyze transcript and images into a structured blueprint.", status: "fallback" },
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
        { agent: "GPT-5.6", action: "Mapped transcript and images into a strict structured blueprint.", status: "passed" },
        { agent: "Truth gate", action: "Validated all source, claim, hotspot, and mechanic references.", status: "passed" },
      ],
    };
  } catch {
    return {
      mode: "demo",
      manifest: demo,
      reason: "Live story analysis was unavailable; Keepscape recovered with a deterministic source-grounded exhibit.",
      trace: [
        { agent: "GPT-5.6", action: "Analyze transcript and images into a structured blueprint.", status: "fallback" },
        { agent: "Truth gate", action: "Recover with a prevalidated manifest.", status: "passed" },
      ],
    };
  }
}

const codexBuildReportSchema = z
  .object({
    summary: z.string().min(1).max(500),
    interactionRationale: z.string().min(1).max(500),
    groundingAssessment: z.string().min(1).max(500),
    recommendations: z.array(z.string().min(1).max(240)).max(6),
    interaction: z
      .object({
        kind: z.enum(["collect", "sequence"]),
        prompt: z.string().min(1).max(220),
        hotspotIds: z.array(z.string().min(1).max(80)).min(3).max(6),
        completionMessage: z.string().min(1).max(280),
        retryMessage: z.string().min(1).max(280),
      })
      .strict(),
    status: z.enum(["passed", "reviewed"]),
  })
  .strict();

const CODEX_BUILD_REPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    interactionRationale: { type: "string" },
    groundingAssessment: { type: "string" },
    recommendations: { type: "array", items: { type: "string" } },
    interaction: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["collect", "sequence"] },
        prompt: { type: "string" },
        hotspotIds: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
        completionMessage: { type: "string" },
        retryMessage: { type: "string" },
      },
      required: ["kind", "prompt", "hotspotIds", "completionMessage", "retryMessage"],
      additionalProperties: false,
    },
    status: { type: "string", enum: ["passed", "reviewed"] },
  },
  required: [
    "summary",
    "interactionRationale",
    "groundingAssessment",
    "recommendations",
    "interaction",
    "status",
  ],
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

  let cleanupWorkspace: (() => Promise<void>) | undefined;
  try {
    const [{ mkdtemp, rm, writeFile }, { tmpdir }, { join }, { Codex }] = await Promise.all([
      import("node:fs/promises"),
      import("node:os"),
      import("node:path"),
      import("@openai/codex-sdk"),
    ]);
    const workspace = await mkdtemp(join(tmpdir(), "keepscape-codex-"));
    cleanupWorkspace = () => rm(workspace, { recursive: true, force: true });
    await writeFile(join(workspace, "manifest.json"), redactInlineAssets(manifest), { encoding: "utf8", mode: 0o600 });
    const codex = new Codex(environment.OPENAI_API_KEY ? { apiKey: environment.OPENAI_API_KEY } : undefined);
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
      `Act as Keepscape's isolated interaction builder. Read manifest.json and CREATE or refine its one typed interaction using only the existing hotspot IDs. Choose collect for independent evidence and sequence only when source material establishes order. Do not change claims, add factual story content, execute visitor code, or access the network. Prompt and completion copy must describe interaction state without asserting new story facts. Return the complete typed interaction plus a concise grounding receipt.`,
      { outputSchema: CODEX_BUILD_REPORT_JSON_SCHEMA },
    );
    const report = codexBuildReportSchema.parse(JSON.parse(turn.finalResponse));

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

    await writeFile(join(workspace, "interaction-spec.json"), JSON.stringify(compiledInteraction, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });

    const builtManifest = exhibitManifestSchema.parse({
      ...manifest,
      scenes: [{ ...scene, interaction: compiledInteraction }],
      buildEvidence: {
        model: `${environment.CODEX_MODEL ?? "Codex account default"} via Codex SDK`,
        agents: [
          ...manifest.buildEvidence.agents,
          {
            name: "Codex interaction builder",
            role: "Created the story-specific typed mechanic in an isolated, no-network workspace.",
            result: report.summary,
            status: report.status,
          },
          {
            name: "Codex grounding review",
            role: "Checked evidence references without inventing family history.",
            result: report.groundingAssessment,
            status: "reviewed",
          },
        ],
        tests: [
          ...manifest.buildEvidence.tests,
          { name: "Codex interaction compile", detail: report.interactionRationale, status: "passed" },
          {
            name: "Hotspot allowlist",
            detail: `${selectedHotspotIds.length} distinct generated interaction references resolve in the scene.`,
            status: "passed",
          },
          { name: "Post-build schema", detail: "The final manifest passed Zod and referential checks.", status: "passed" },
        ],
        generatedFiles: Array.from(
          new Set([...manifest.buildEvidence.generatedFiles, "temporary-workspace/interaction-spec.json"]),
        ),
      },
    });
    await writeFile(join(workspace, "compiled-manifest.json"), JSON.stringify(builtManifest, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });

    return {
      mode: "live",
      manifest: builtManifest,
      trace: [
        { agent: "Codex", action: "Created a typed interaction in an isolated no-network workspace.", status: "passed" },
        { agent: "Truth gate", action: "Revalidated the manifest after the Codex build pass.", status: "passed" },
        { agent: "Typed runtime", action: "Prepared the schema-safe interaction for rendering.", status: "passed" },
      ],
    };
  } catch {
    return demoBuildResult(
      manifest,
      "The isolated Codex build was unavailable; Keepscape recovered with the validated typed runtime.",
    );
  } finally {
    await cleanupWorkspace?.().catch(() => undefined);
  }
}

export const defaultSampleSlug = nightMarketExhibit.slug;
