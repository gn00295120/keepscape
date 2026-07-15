import { z } from "zod";

export const normalizedRegionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

export const sourceSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["photo", "audio", "human"]),
    label: z.string().min(1),
    assetPath: z.string().optional(),
    capturedAt: z.string().optional(),
    region: normalizedRegionSchema.optional(),
    timeStartSeconds: z.number().nonnegative().optional(),
    timeEndSeconds: z.number().positive().optional(),
    excerpt: z.string().optional(),
  })
  .superRefine((source, context) => {
    if (source.timeEndSeconds !== undefined && source.timeStartSeconds === undefined) {
      context.addIssue({
        code: "custom",
        message: "Audio source ranges require a start time.",
        path: ["timeStartSeconds"],
      });
    }
    if (
      source.timeStartSeconds !== undefined &&
      source.timeEndSeconds !== undefined &&
      source.timeEndSeconds <= source.timeStartSeconds
    ) {
      context.addIssue({
        code: "custom",
        message: "Audio source end time must follow its start time.",
        path: ["timeEndSeconds"],
      });
    }
  });

export const groundedClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  status: z.enum(["source-backed", "human-confirmed", "uncertain"]),
  sourceIds: z.array(z.string().min(1)).min(1),
});

export const hotspotSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shortLabel: z.string().min(1),
  body: z.string().min(1),
  xPercent: z.number().min(4).max(96),
  yPercent: z.number().min(8).max(92),
  scale: z.number().min(0.65).max(1.6).default(1),
  icon: z.enum(["lantern", "ticket", "camera", "bicycle", "bell", "wrench", "note", "star"]),
  claimIds: z.array(z.string().min(1)).min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  interpretation: z.string().optional(),
});

const collectInteractionSchema = z.object({
  kind: z.literal("collect"),
  prompt: z.string().min(1),
  targetHotspotIds: z.array(z.string().min(1)).min(2),
  completionMessage: z.string().min(1),
});

const sequenceInteractionSchema = z.object({
  kind: z.literal("sequence"),
  prompt: z.string().min(1),
  stepHotspotIds: z.array(z.string().min(1)).min(3),
  successMessage: z.string().min(1),
  retryMessage: z.string().min(1),
});

export const interactionSchema = z.discriminatedUnion("kind", [
  collectInteractionSchema,
  sequenceInteractionSchema,
]);

export const sceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  eyebrow: z.string().min(1),
  narration: z.string().min(1),
  stage: z.enum(["lantern-lane", "repair-bench"]),
  sourceIds: z.array(z.string().min(1)).min(1),
  hotspots: z.array(hotspotSchema).min(3),
  interaction: interactionSchema,
});

export const buildEvidenceSchema = z.object({
  model: z.string().min(1),
  agents: z.array(
    z.object({
      name: z.string().min(1),
      role: z.string().min(1),
      result: z.string().min(1),
      status: z.enum(["passed", "reviewed"]),
    }),
  ),
  tests: z.array(
    z.object({
      name: z.string().min(1),
      detail: z.string().min(1),
      status: z.literal("passed"),
    }),
  ),
  generatedFiles: z.array(z.string().min(1)),
});

export const exhibitManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    dedication: z.string().min(1),
    truthNote: z.string().min(1),
    palette: z.object({
      ink: z.string().min(1),
      paper: z.string().min(1),
      accent: z.string().min(1),
      glow: z.string().min(1),
    }),
    sources: z.array(sourceSchema).min(3),
    claims: z.array(groundedClaimSchema).min(3),
    scenes: z.array(sceneSchema).min(1),
    buildEvidence: buildEvidenceSchema,
  })
  .superRefine((manifest, context) => {
    const sourceIds = new Set(manifest.sources.map((source) => source.id));
    const claimIds = new Set(manifest.claims.map((claim) => claim.id));
    const claimById = new Map(manifest.claims.map((claim) => [claim.id, claim]));

    const reportDuplicates = (values: string[], label: string) => {
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value)) {
          context.addIssue({ code: "custom", message: `${label} ID ${value} must be unique.` });
        }
        seen.add(value);
      }
    };

    reportDuplicates(manifest.sources.map((source) => source.id), "Source");
    reportDuplicates(manifest.claims.map((claim) => claim.id), "Claim");
    reportDuplicates(manifest.scenes.map((scene) => scene.id), "Scene");
    reportDuplicates(manifest.scenes.flatMap((scene) => scene.hotspots.map((hotspot) => hotspot.id)), "Hotspot");

    for (const claim of manifest.claims) {
      const referencedSources = claim.sourceIds.flatMap((sourceId) => {
        const source = manifest.sources.find((item) => item.id === sourceId);
        return source ? [source] : [];
      });
      for (const sourceId of claim.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          context.addIssue({ code: "custom", message: `Claim ${claim.id} references missing source ${sourceId}.` });
        }
      }
      if (
        claim.status === "source-backed" &&
        !referencedSources.some((source) => source.kind === "photo" || source.kind === "audio")
      ) {
        context.addIssue({
          code: "custom",
          message: `Source-backed claim ${claim.id} requires photo or audio evidence.`,
        });
      }
      if (claim.status === "human-confirmed" && !referencedSources.some((source) => source.kind === "human")) {
        context.addIssue({
          code: "custom",
          message: `Human-confirmed claim ${claim.id} requires an explicit human source.`,
        });
      }
    }

    for (const scene of manifest.scenes) {
      const sceneHotspotIds = new Set(scene.hotspots.map((hotspot) => hotspot.id));
      for (const sourceId of scene.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          context.addIssue({ code: "custom", message: `Scene ${scene.id} references missing source ${sourceId}.` });
        }
      }
      for (const hotspot of scene.hotspots) {
        const hotspotSourceIds = new Set(hotspot.sourceIds);
        for (const sourceId of hotspot.sourceIds) {
          if (!sourceIds.has(sourceId)) {
            context.addIssue({ code: "custom", message: `Hotspot ${hotspot.id} references missing source ${sourceId}.` });
          }
        }
        for (const claimId of hotspot.claimIds) {
          if (!claimIds.has(claimId)) {
            context.addIssue({ code: "custom", message: `Hotspot ${hotspot.id} references missing claim ${claimId}.` });
          }
          const claim = claimById.get(claimId);
          for (const sourceId of claim?.sourceIds ?? []) {
            if (!hotspotSourceIds.has(sourceId)) {
              context.addIssue({
                code: "custom",
                message: `Hotspot ${hotspot.id} omits source ${sourceId} required by claim ${claimId}.`,
              });
            }
          }
        }
        for (const sourceId of hotspot.sourceIds) {
          if (!scene.sourceIds.includes(sourceId)) {
            context.addIssue({
              code: "custom",
              message: `Scene ${scene.id} omits hotspot source ${sourceId}.`,
            });
          }
        }
      }
      const ids =
        scene.interaction.kind === "collect"
          ? scene.interaction.targetHotspotIds
          : scene.interaction.stepHotspotIds;
      for (const hotspotId of ids) {
        if (!sceneHotspotIds.has(hotspotId)) {
          context.addIssue({
            code: "custom",
            message: `Interaction in ${scene.id} references missing hotspot ${hotspotId}.`,
          });
        }
      }
    }
  });

export type Source = z.infer<typeof sourceSchema>;
export type GroundedClaim = z.infer<typeof groundedClaimSchema>;
export type Hotspot = z.infer<typeof hotspotSchema>;
export type ExhibitScene = z.infer<typeof sceneSchema>;
export type ExhibitManifest = z.infer<typeof exhibitManifestSchema>;
