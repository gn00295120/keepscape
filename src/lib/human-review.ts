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
