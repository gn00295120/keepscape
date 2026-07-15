import { exhibitManifestSchema, type ExhibitManifest, type Source } from "@/lib/exhibit-schema";

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Turns explicit source-desk confirmations into first-class provenance.
 * Preserved uncertainties deliberately remain unchanged and visibly uncertain.
 */
export function applyHumanConfirmations(
  manifest: ExhibitManifest,
  confirmedClaimIds: ReadonlySet<string>,
): ExhibitManifest {
  const confirmations = manifest.claims.filter(
    (claim) => claim.status === "uncertain" && confirmedClaimIds.has(claim.id),
  );
  if (confirmations.length === 0) return structuredClone(manifest);

  const confirmationSourceByClaim = new Map(
    confirmations.map((claim) => [claim.id, `human-confirmation-${claim.id}`]),
  );
  const confirmationSources: Source[] = confirmations.map((claim) => ({
    id: confirmationSourceByClaim.get(claim.id) as string,
    kind: "human",
    humanRole: "confirmation",
    confirmedClaimId: claim.id,
    label: "Storyteller confirmation · source desk",
    excerpt: `The storyteller explicitly confirmed: “${claim.text}”`,
  }));

  const reviewed = {
    ...manifest,
    sources: [...manifest.sources, ...confirmationSources],
    claims: manifest.claims.map((claim) => {
      const confirmationSourceId = confirmationSourceByClaim.get(claim.id);
      return confirmationSourceId
        ? {
            ...claim,
            status: "human-confirmed" as const,
            sourceIds: unique([...claim.sourceIds, confirmationSourceId]),
          }
        : claim;
    }),
    scenes: manifest.scenes.map((scene) => {
      const sceneConfirmationSourceIds = scene.hotspots.flatMap((hotspot) =>
        hotspot.claimIds.flatMap((claimId) => {
          const sourceId = confirmationSourceByClaim.get(claimId);
          return sourceId ? [sourceId] : [];
        }),
      );

      return {
        ...scene,
        sourceIds: unique([...scene.sourceIds, ...sceneConfirmationSourceIds]),
        hotspots: scene.hotspots.map((hotspot) => ({
          ...hotspot,
          sourceIds: unique([
            ...hotspot.sourceIds,
            ...hotspot.claimIds.flatMap((claimId) => {
              const sourceId = confirmationSourceByClaim.get(claimId);
              return sourceId ? [sourceId] : [];
            }),
          ]),
        })),
      };
    }),
    buildEvidence: {
      ...manifest.buildEvidence,
      agents: [
        ...manifest.buildEvidence.agents,
        {
          name: "Storyteller confirmation",
          role: "Resolved only the claims the model and supplied sources could not establish.",
          result: `${confirmations.length} uncertain detail${confirmations.length === 1 ? "" : "s"} explicitly confirmed.`,
          status: "reviewed" as const,
        },
      ],
      tests: [
        ...manifest.buildEvidence.tests,
        {
          name: "Human uncertainty gate",
          detail: `${confirmations.length} confirmation source${confirmations.length === 1 ? "" : "s"} attached and revalidated.`,
          status: "passed" as const,
        },
      ],
    },
  };

  return exhibitManifestSchema.parse(reviewed);
}

export const GENERATED_COPY_REVIEW_SOURCE_ID = "human-generated-copy-review";
export const INTERACTION_COPY_REVIEW_SOURCE_ID = "human-interaction-copy-review";
export const preservedUncertaintySourceId = (claimId: string) => `human-preserved-uncertainty-${claimId}`;

/** Records the required source-desk read-through of displayed claims and all
 * model-authored exhibit, scene, hotspot, and interaction-draft copy. This is a human language review receipt,
 * not a claim that the host can semantically prove prose. */
export function recordSourceDeskReview(
  manifest: ExhibitManifest,
  preservedClaimIds: ReadonlySet<string>,
): ExhibitManifest {
  if (manifest.sources.some((source) => source.id === GENERATED_COPY_REVIEW_SOURCE_ID)) {
    return structuredClone(manifest);
  }

  const remainingUncertainties = manifest.claims.filter((claim) => claim.status === "uncertain");
  const unresolved = remainingUncertainties.filter((claim) => !preservedClaimIds.has(claim.id));
  if (unresolved.length > 0) {
    throw new Error(`Source-desk review is missing a decision for: ${unresolved.map((claim) => claim.id).join(", ")}`);
  }
  const preservationSources: Source[] = remainingUncertainties.map((claim) => ({
    id: preservedUncertaintySourceId(claim.id),
    kind: "human",
    humanRole: "uncertainty-preserved",
    label: "Storyteller choice · uncertainty preserved",
    excerpt: `The storyteller reviewed this claim and deliberately kept it uncertain: “${claim.text}”`,
  }));
  const reviewSourceIds = [GENERATED_COPY_REVIEW_SOURCE_ID, ...preservationSources.map((source) => source.id)];

  return exhibitManifestSchema.parse({
    ...manifest,
    sources: [
      ...manifest.sources,
      {
        id: GENERATED_COPY_REVIEW_SOURCE_ID,
        kind: "human" as const,
        humanRole: "language-review" as const,
        label: "Storyteller generated-language review · source desk",
        excerpt: "The storyteller reviewed the displayed claims and all generated exhibit, scene, hotspot, and interaction-draft copy against the listed sources before build.",
      },
      ...preservationSources,
    ],
    scenes: manifest.scenes.map((scene) => ({
      ...scene,
      sourceIds: unique([...scene.sourceIds, ...reviewSourceIds]),
      hotspots: scene.hotspots.map((hotspot) => ({
        ...hotspot,
        sourceIds: unique([
          ...hotspot.sourceIds,
          ...hotspot.claimIds.flatMap((claimId) =>
            preservedClaimIds.has(claimId) ? [preservedUncertaintySourceId(claimId)] : []),
        ]),
      })),
    })),
    buildEvidence: {
      ...manifest.buildEvidence,
      agents: [
        ...manifest.buildEvidence.agents,
        {
          name: "Storyteller language review",
          role: "Reviewed generated narrative wording after the host resolved its typed references.",
          result: `The displayed generated story copy passed the explicit read-through gate; ${remainingUncertainties.length} uncertain claim${remainingUncertainties.length === 1 ? " was" : "s were"} deliberately preserved.`,
          status: "reviewed" as const,
        },
      ],
      tests: [
        ...manifest.buildEvidence.tests,
        {
          name: "Generated-language gate",
          detail: `A durable language-review source and ${preservationSources.length} preserved-uncertainty receipt${preservationSources.length === 1 ? "" : "s"} were attached before build.`,
          status: "passed" as const,
        },
      ],
    },
  });
}

/** Records the person's final review of the built interaction state in either
 * live or validated-fallback mode. Semantic approval remains human. */
export function recordInteractionCopyReview(manifest: ExhibitManifest): ExhibitManifest {
  if (manifest.sources.some((source) => source.id === INTERACTION_COPY_REVIEW_SOURCE_ID)) {
    return structuredClone(manifest);
  }

  return exhibitManifestSchema.parse({
    ...manifest,
    sources: [
      ...manifest.sources,
      {
        id: INTERACTION_COPY_REVIEW_SOURCE_ID,
        kind: "human" as const,
        humanRole: "language-review" as const,
        label: "Storyteller interaction-language review · build trail",
        excerpt: "The storyteller reviewed the final built mechanic, target set or order, and preserved prompt and completion/retry copy before entering the exhibit.",
      },
    ],
    scenes: manifest.scenes.map((scene) => ({
      ...scene,
      sourceIds: unique([...scene.sourceIds, INTERACTION_COPY_REVIEW_SOURCE_ID]),
    })),
    buildEvidence: {
      ...manifest.buildEvidence,
      agents: [
        ...manifest.buildEvidence.agents,
        {
          name: "Final interaction-language review",
          role: "Reviewed the final built mechanic, target set or order, and preserved interaction-state wording before launch.",
          result: "The displayed mechanic, targets/order, prompt, and completion/retry copy were explicitly approved before launch.",
          status: "reviewed" as const,
        },
      ],
      tests: [
        ...manifest.buildEvidence.tests,
        {
          name: "Final interaction-language gate",
          detail: "A durable human review source was attached after the live or validated-fallback build attempt.",
          status: "passed" as const,
        },
      ],
    },
  });
}
