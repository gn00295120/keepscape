"use client";

import { Check, FileAudio, Image as ImageIcon, MessageSquareText, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { ExhibitManifest, GroundedClaim, Source } from "@/lib/exhibit-schema";

type SourceDeskProps = {
  manifest: ExhibitManifest;
  provenanceNotice?: string;
  confirmedClaimIds: ReadonlySet<string>;
  preservedClaimIds: ReadonlySet<string>;
  onConfirmClaim: (claimId: string) => void;
  onPreserveClaim: (claimId: string) => void;
  onApprove: () => void;
  onBack: () => void;
};

const sourceIcon = {
  photo: ImageIcon,
  audio: FileAudio,
  human: MessageSquareText,
} as const;

function sourceLocator(source: Source) {
  if (source.kind === "audio" && source.timeStartSeconds !== undefined) {
    const end = source.timeEndSeconds !== undefined ? `–${source.timeEndSeconds}s` : "";
    return `${source.timeStartSeconds}s${end}`;
  }
  if (source.kind === "photo" && source.region) {
    const wholePhoto =
      source.region.x === 0 && source.region.y === 0 && source.region.width === 1 && source.region.height === 1;
    return wholePhoto ? "full photo evidence view" : "marked photo region";
  }
  if (source.kind === "photo") return "full photo source";
  if (source.kind === "audio") return "full audio source";
  if (source.humanRole === "story-note") return "storyteller-provided note";
  if (source.humanRole === "confirmation") return "family confirmation";
  if (source.humanRole === "uncertainty-preserved") return "deliberately kept uncertain";
  return "language review receipt";
}

function claimStatus(
  claim: GroundedClaim,
  confirmedClaimIds: ReadonlySet<string>,
  preservedClaimIds: ReadonlySet<string>,
) {
  if (claim.status === "uncertain" && !confirmedClaimIds.has(claim.id)) {
    if (preservedClaimIds.has(claim.id)) {
      return { label: "Kept uncertain", tone: "preserved" } as const;
    }
    return { label: "Needs your word", tone: "uncertain" } as const;
  }
  if (claim.status === "human-confirmed" || confirmedClaimIds.has(claim.id)) {
    return { label: "Family confirmed", tone: "confirmed" } as const;
  }
  return { label: "Source-backed", tone: "grounded" } as const;
}

export function SourceDesk({
  manifest,
  provenanceNotice,
  confirmedClaimIds,
  preservedClaimIds,
  onConfirmClaim,
  onPreserveClaim,
  onApprove,
  onBack,
}: SourceDeskProps) {
  const [generatedCopyReviewed, setGeneratedCopyReviewed] = useState(false);
  const sourceById = new Map(manifest.sources.map((source) => [source.id, source]));
  const unresolvedClaims = manifest.claims.filter(
    (claim) =>
      claim.status === "uncertain" &&
      !confirmedClaimIds.has(claim.id) &&
      !preservedClaimIds.has(claim.id),
  );
  const generatedCopyFieldCount =
    manifest.claims.length +
    4 +
    manifest.scenes.reduce(
      (total, scene) =>
        total +
        3 +
        scene.hotspots.reduce((hotspotTotal, hotspot) => hotspotTotal + (hotspot.interpretation ? 4 : 3), 0) +
        (scene.interaction.kind === "sequence" ? 5 : 4),
      0,
    );

  return (
    <section className="studio-view source-desk" aria-labelledby="source-desk-title">
      <div className="view-heading">
        <div>
          <span className="eyebrow">The source desk · {manifest.title}</span>
          <h1 id="source-desk-title">Keep the memory. Question the guess.</h1>
        </div>
        <p>
          This story map separates what the source shows from what still needs a person. Live mode asks GPT-5.6
          for the map; this bundled path replays a checked one. Nothing enters as fact without a visible trail.
        </p>
      </div>

      <div className="desk-layout">
        <aside className="source-ledger" aria-labelledby="source-ledger-title">
          <div className="panel-label">
            <span id="source-ledger-title">Original material</span>
            <span>{manifest.sources.length} sources</span>
          </div>
          <div className="source-stack">
            {manifest.sources.map((source, index) => {
              const Icon = sourceIcon[source.kind];
              return (
                <article className={`source-slip source-slip--${source.kind}`} id={`source-${source.id}`} key={source.id}>
                  <div className="source-slip__index">S{String(index + 1).padStart(2, "0")}</div>
                  <Icon size={18} aria-hidden="true" />
                  <div>
                    <h2>{source.label}</h2>
                    <p>{source.excerpt ?? sourceLocator(source)}</p>
                  </div>
                  <span className="source-slip__locator">{sourceLocator(source)}</span>
                </article>
              );
            })}
          </div>
          <div className="privacy-note">
            <ShieldCheck size={19} aria-hidden="true" />
            <p>
              <strong>No resurrection tricks.</strong> Keepscape never clones a voice or fabricates a person.
            </p>
          </div>
        </aside>

        <div className="claim-sheet">
          {provenanceNotice && (
            <div className="provenance-notice" role="status">
              <ShieldCheck size={17} aria-hidden="true" />
              <p>{provenanceNotice}</p>
            </div>
          )}
          <div className="panel-label">
            <span>Story claims</span>
            <span>{manifest.claims.length - unresolvedClaims.length}/{manifest.claims.length} resolved</span>
          </div>

          <ol className="claim-list">
            {manifest.claims.map((claim, index) => {
              const status = claimStatus(claim, confirmedClaimIds, preservedClaimIds);
              return (
                <li className="claim-row" key={claim.id}>
                  <span className="claim-row__number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="claim-row__body">
                    <p>{claim.text}</p>
                    <div className="claim-row__sources" aria-label="Evidence sources">
                      {claim.sourceIds.map((sourceId) => {
                        const source = sourceById.get(sourceId);
                        return (
                          <a href={`#source-${sourceId}`} key={sourceId}>
                            {source?.label ?? sourceId}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                  <div className="claim-row__action">
                    <span className={`truth-badge truth-badge--${status.tone}`}>
                      {status.tone !== "uncertain" && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                      {status.label}
                    </span>
                    {status.tone === "uncertain" && (
                      <div className="claim-row__choices">
                        <button className="text-button" type="button" onClick={() => onConfirmClaim(claim.id)}>
                          Confirm as remembered
                        </button>
                        <button
                          className="text-button text-button--quiet"
                          type="button"
                          onClick={() => onPreserveClaim(claim.id)}
                        >
                          Preserve uncertainty
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <section className="copy-review" aria-labelledby="copy-review-title">
            <div className="copy-review__heading">
              <div>
                <span className="ticket-number">Human language gate</span>
                <h2 id="copy-review-title">Review the generated story copy.</h2>
              </div>
              <span>{generatedCopyFieldCount} displayed fields</span>
            </div>
            <p className="copy-review__intro">
              The host can prove that references resolve; only a person can decide whether the generated wording
              stays faithful to the material. Claims are shown above; every other GPT-authored story field is shown
              below before build.
            </p>
            <div className="copy-review__scenes">
              <article>
                <span>Exhibit title</span>
                <h3>{manifest.title}</h3>
                <span>Subtitle</span>
                <p>{manifest.subtitle}</p>
                <details>
                  <summary>Inspect dedication and truth note</summary>
                  <ul>
                    <li>
                      <strong>Dedication</strong>
                      <p>{manifest.dedication}</p>
                    </li>
                    <li>
                      <strong>Truth note</strong>
                      <p>{manifest.truthNote}</p>
                    </li>
                  </ul>
                </details>
              </article>
              {manifest.scenes.map((scene) => (
                <article key={scene.id}>
                  <span>Scene framing</span>
                  <h3>{scene.title}</h3>
                  <p>{scene.eyebrow}</p>
                  <span>Narration</span>
                  <p>{scene.narration}</p>
                  <details>
                    <summary>Inspect {scene.hotspots.length} hotspot copy groups</summary>
                    <ul>
                      {scene.hotspots.map((hotspot) => (
                        <li key={hotspot.id}>
                          <strong>{hotspot.title} · control label “{hotspot.shortLabel}”</strong>
                          <p>{hotspot.body}</p>
                          {hotspot.interpretation ? <p>Interpretation label: {hotspot.interpretation}</p> : null}
                          <small>
                            Cites {hotspot.sourceIds.map((sourceId) => sourceById.get(sourceId)?.label ?? sourceId).join(" · ")}
                          </small>
                        </li>
                      ))}
                    </ul>
                  </details>
                  <details>
                    <summary>Inspect the pre-Codex interaction draft</summary>
                    <ul>
                      <li>
                        <strong>Mechanic</strong>
                        <p>{scene.interaction.kind === "collect" ? "Collection · independent targets" : "Sequence · required source order"}</p>
                      </li>
                      <li>
                        <strong>{scene.interaction.kind === "collect" ? "Targets" : "Required order"}</strong>
                        <p>
                          {(scene.interaction.kind === "collect"
                            ? scene.interaction.targetHotspotIds
                            : scene.interaction.stepHotspotIds)
                            .map((hotspotId) => scene.hotspots.find((hotspot) => hotspot.id === hotspotId)?.title ?? hotspotId)
                            .join(" → ")}
                        </p>
                      </li>
                      <li>
                        <strong>Prompt</strong>
                        <p>{scene.interaction.prompt}</p>
                      </li>
                      <li>
                        <strong>{scene.interaction.kind === "collect" ? "Completion" : "Success"}</strong>
                        <p>
                          {scene.interaction.kind === "collect"
                            ? scene.interaction.completionMessage
                            : scene.interaction.successMessage}
                        </p>
                      </li>
                      {scene.interaction.kind === "sequence" ? (
                        <li>
                          <strong>Retry</strong>
                          <p>{scene.interaction.retryMessage}</p>
                        </li>
                      ) : null}
                    </ul>
                  </details>
                </article>
              ))}
            </div>
            <label className="copy-review__approval">
              <input
                type="checkbox"
                checked={generatedCopyReviewed}
                onChange={(event) => setGeneratedCopyReviewed(event.target.checked)}
              />
              <span>I reviewed the displayed claims and all generated exhibit, scene, hotspot, and interaction-draft copy against the listed sources.</span>
            </label>
          </section>

          <div className="truth-note">
            <span>Truth note</span>
            <p>{manifest.truthNote}</p>
          </div>

          <div className="view-actions">
            <button className="button button--quiet" type="button" onClick={onBack}>
              Choose another story
            </button>
            <div className="view-actions__primary">
              {(unresolvedClaims.length > 0 || !generatedCopyReviewed) && (
                <p role="status">
                  {unresolvedClaims.length > 0
                    ? `Resolve ${unresolvedClaims.length} uncertain detail${unresolvedClaims.length > 1 ? "s" : ""} first.`
                    : "Complete the generated-language review first."}
                </p>
              )}
              <button
                className="button button--ink"
                type="button"
                onClick={onApprove}
                disabled={unresolvedClaims.length > 0 || !generatedCopyReviewed}
              >
                Approve the story map
                <Check size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
