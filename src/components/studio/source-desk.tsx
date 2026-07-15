import { Check, FileAudio, Image as ImageIcon, MessageSquareText, ShieldCheck } from "lucide-react";

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
    return "marked photo region";
  }
  return source.kind === "human" ? "family confirmation" : "full source";
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
  const sourceById = new Map(manifest.sources.map((source) => [source.id, source]));
  const unresolvedClaims = manifest.claims.filter(
    (claim) =>
      claim.status === "uncertain" &&
      !confirmedClaimIds.has(claim.id) &&
      !preservedClaimIds.has(claim.id),
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

          <div className="truth-note">
            <span>Truth note</span>
            <p>{manifest.truthNote}</p>
          </div>

          <div className="view-actions">
            <button className="button button--quiet" type="button" onClick={onBack}>
              Choose another story
            </button>
            <div className="view-actions__primary">
              {unresolvedClaims.length > 0 && (
                <p role="status">Confirm {unresolvedClaims.length} uncertain detail{unresolvedClaims.length > 1 ? "s" : ""} first.</p>
              )}
              <button
                className="button button--ink"
                type="button"
                onClick={onApprove}
                disabled={unresolvedClaims.length > 0}
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
