import { z } from "zod";

export const normalizedRegionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).superRefine((region, context) => {
  if (region.x + region.width > 1) {
    context.addIssue({
      code: "custom",
      message: "Photo source region must fit within the image width.",
      path: ["width"],
    });
  }
  if (region.y + region.height > 1) {
    context.addIssue({
      code: "custom",
      message: "Photo source region must fit within the image height.",
      path: ["height"],
    });
  }
});

export const sourceSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["photo", "audio", "human"]),
    humanRole: z.enum(["story-note", "confirmation", "language-review", "uncertainty-preserved"]).optional(),
    confirmedClaimId: z.string().min(1).optional(),
    label: z.string().min(1),
    assetPath: z.string().optional(),
    capturedAt: z.string().optional(),
    region: normalizedRegionSchema.optional(),
    timeStartSeconds: z.number().nonnegative().optional(),
    timeEndSeconds: z.number().positive().optional(),
    excerpt: z.string().optional(),
  })
  .superRefine((source, context) => {
    if (source.kind === "human" && source.humanRole === undefined) {
      context.addIssue({
        code: "custom",
        message: "Human sources must identify a story note, confirmation, language review, or uncertainty decision.",
        path: ["humanRole"],
      });
    }
    if (source.kind !== "human" && source.humanRole !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only human sources can carry a human review role.",
        path: ["humanRole"],
      });
    }
    if (source.humanRole === "confirmation" && source.confirmedClaimId === undefined) {
      context.addIssue({
        code: "custom",
        message: "Human confirmation sources must identify the exact confirmed claim.",
        path: ["confirmedClaimId"],
      });
    }
    if (source.humanRole !== "confirmation" && source.confirmedClaimId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Only claim confirmation sources can bind a confirmed claim ID.",
        path: ["confirmedClaimId"],
      });
    }
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

export const spatialPlaneSlotSchema = z.enum([
  "near-left",
  "near-right",
  "mid-left",
  "mid-right",
  "far-center",
]);

export const spatialPlaneSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  slot: spatialPlaneSlotSchema,
});

export const photoDioramaSpatialSchema = z.object({
  kind: z.literal("photo-diorama"),
  preset: z.enum(["memory-corridor", "gallery-arc", "tabletop"]),
  disclaimer: z.string().min(1).max(500),
  planes: z.array(spatialPlaneSchema).min(3).max(5),
});

export const spatialAnchorSchema = z.object({
  planeId: z.string().min(1),
  u: z.number().min(0).max(1),
  v: z.number().min(0).max(1),
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
  spatialAnchor: spatialAnchorSchema.optional(),
});

const uniqueInteractionIds = (minimum: number) =>
  z
    .array(z.string().min(1))
    .min(minimum)
    .superRefine((ids, context) => {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: "custom",
          message: "Interaction hotspot IDs must be unique.",
        });
      }
    });

const collectInteractionSchema = z.object({
  kind: z.literal("collect"),
  prompt: z.string().min(1),
  targetHotspotIds: uniqueInteractionIds(2),
  completionMessage: z.string().min(1),
});

const sequenceInteractionSchema = z.object({
  kind: z.literal("sequence"),
  prompt: z.string().min(1),
  stepHotspotIds: uniqueInteractionIds(3),
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
  spatial: photoDioramaSpatialSchema.optional(),
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
    const sourceById = new Map(manifest.sources.map((source) => [source.id, source]));
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
    reportDuplicates(
      manifest.scenes.flatMap((scene) => scene.spatial?.planes.map((plane) => plane.id) ?? []),
      "Spatial plane",
    );

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
        !referencedSources.some(
          (source) =>
            (source.kind === "photo" && source.region !== undefined) ||
            (source.kind === "audio" && source.timeStartSeconds !== undefined),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: `Source-backed claim ${claim.id} requires a photo region or audio timecode.`,
        });
      }
      if (
        claim.status === "human-confirmed" &&
        !referencedSources.some(
          (source) =>
            source.kind === "human" &&
            source.humanRole === "confirmation" &&
            source.confirmedClaimId === claim.id,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: `Human-confirmed claim ${claim.id} requires an explicit human confirmation source.`,
        });
      }
    }

    for (const source of manifest.sources) {
      if (source.humanRole !== "confirmation" || !source.confirmedClaimId) continue;
      const confirmedClaim = claimById.get(source.confirmedClaimId);
      if (
        !confirmedClaim ||
        confirmedClaim.status !== "human-confirmed" ||
        !confirmedClaim.sourceIds.includes(source.id)
      ) {
        context.addIssue({
          code: "custom",
          message: `Confirmation source ${source.id} must be attached to its exact human-confirmed claim ${source.confirmedClaimId}.`,
        });
      }
    }

    for (const scene of manifest.scenes) {
      const sceneHotspotIds = new Set(scene.hotspots.map((hotspot) => hotspot.id));
      const spatialPlaneById = new Map(scene.spatial?.planes.map((plane) => [plane.id, plane]) ?? []);
      if (scene.spatial) {
        reportDuplicates(scene.spatial.planes.map((plane) => plane.sourceId), `Spatial plane source in ${scene.id}`);
        reportDuplicates(scene.spatial.planes.map((plane) => plane.slot), `Spatial plane slot in ${scene.id}`);
      }
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
      for (const plane of scene.spatial?.planes ?? []) {
        const source = sourceById.get(plane.sourceId);
        if (!source) {
          context.addIssue({
            code: "custom",
            message: `Spatial plane ${plane.id} references missing source ${plane.sourceId}.`,
          });
        } else if (source.kind !== "photo") {
          context.addIssue({
            code: "custom",
            message: `Spatial plane ${plane.id} requires a photo source.`,
          });
        }
        if (!scene.sourceIds.includes(plane.sourceId)) {
          context.addIssue({
            code: "custom",
            message: `Scene ${scene.id} omits spatial plane source ${plane.sourceId}.`,
          });
        }
      }
      for (const hotspot of scene.hotspots) {
        if (hotspot.spatialAnchor) {
          const anchorPlane = spatialPlaneById.get(hotspot.spatialAnchor.planeId);
          if (!anchorPlane) {
            context.addIssue({
              code: "custom",
              message: `Hotspot ${hotspot.id} references missing spatial plane ${hotspot.spatialAnchor.planeId}.`,
            });
          } else if (!hotspot.sourceIds.includes(anchorPlane.sourceId)) {
            context.addIssue({
              code: "custom",
              message: `Hotspot ${hotspot.id} spatial anchor must use one of its cited photo sources.`,
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
export type SpatialPlaneSlot = z.infer<typeof spatialPlaneSlotSchema>;
export type SpatialPlane = z.infer<typeof spatialPlaneSchema>;
export type PhotoDioramaSpatial = z.infer<typeof photoDioramaSpatialSchema>;
export type SpatialAnchor = z.infer<typeof spatialAnchorSchema>;
export type Hotspot = z.infer<typeof hotspotSchema>;
export type ExhibitScene = z.infer<typeof sceneSchema>;
export type ExhibitManifest = z.infer<typeof exhibitManifestSchema>;
