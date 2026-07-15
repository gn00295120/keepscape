"use client";

import Image from "next/image";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SVGProps,
} from "react";

import type {
  ExhibitManifest,
  ExhibitScene,
  GroundedClaim,
  Hotspot,
  Source,
} from "@/lib/exhibit-schema";

import styles from "./exhibit-player.module.css";
import { SpatialStage } from "./spatial-stage";

export interface ExhibitPlayerProps {
  manifest: ExhibitManifest;
  onExit?: () => void;
}

interface SceneProgress {
  collectedIds: string[];
  sequenceIndex: number;
  complete: boolean;
}

const EMPTY_PROGRESS: SceneProgress = {
  collectedIds: [],
  sequenceIndex: 0,
  complete: false,
};

const stageArt: Record<ExhibitScene["stage"], string> = {
  "lantern-lane": "/samples/night-market-stage.svg",
  "repair-bench": "/samples/repair-bench-stage.svg",
};

function createProgress(manifest: ExhibitManifest): Record<string, SceneProgress> {
  return Object.fromEntries(
    manifest.scenes.map((scene) => [
      scene.id,
      { collectedIds: [], sequenceIndex: 0, complete: false },
    ]),
  );
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function sourceTypeLabel(source: Source): string {
  if (source.kind === "photo") {
    if (!source.region) return "Photo source view";
    const wholePhoto =
      source.region.x === 0 && source.region.y === 0 && source.region.width === 1 && source.region.height === 1;
    return wholePhoto ? "Full photo view" : "Photo region";
  }
  if (source.kind === "audio") return source.timeStartSeconds !== undefined ? "Audio timecode" : "Audio source";
  if (source.humanRole === "story-note") return "Human story note";
  if (source.humanRole === "confirmation") return "Human confirmation";
  if (source.humanRole === "uncertainty-preserved") return "Uncertainty decision";
  return "Human language review";
}

function humanReviewSeal(source: Source): string {
  if (source.humanRole === "story-note") {
    return "Submitted by a human contributor. Claims based on this note still require a source-desk decision.";
  }
  if (source.humanRole === "confirmation") {
    return "Explicitly reviewed and confirmed by a human contributor.";
  }
  if (source.humanRole === "uncertainty-preserved") {
    return "Explicitly reviewed by a human contributor and deliberately kept uncertain — not confirmed as fact.";
  }
  return "Generated wording was reviewed by a human contributor. This receipt does not confirm it as fact.";
}

function claimStatusLabel(claim: GroundedClaim): string {
  if (claim.status === "source-backed") return "Source-backed";
  if (claim.status === "human-confirmed") return "Confirmed by family";
  return "Marked uncertain";
}

function MiniIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: Hotspot["icon"] | "archive" | "audio" | "person" | "reset" | "close" | "arrow" | "check" | "source" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };

  switch (name) {
    case "lantern":
      return <svg {...common}><path d="M8 5h8l2 4-2 8H8L6 9l2-4Z"/><path d="M9 2h6M9 20h6M12 17v3"/></svg>;
    case "ticket":
      return <svg {...common}><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z"/><path d="M12 7v10"/></svg>;
    case "camera":
      return <svg {...common}><path d="M4 7h4l1.5-2h5L16 7h4v12H4V7Z"/><circle cx="12" cy="13" r="3.5"/></svg>;
    case "bicycle":
      return <svg {...common}><circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><path d="m6 17 4-8 3 8h5l-5-8H9M8 6h3"/></svg>;
    case "bell":
      return <svg {...common}><path d="M6 16h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v3.5L6 16Z"/><path d="M10 19h4"/></svg>;
    case "wrench":
      return <svg {...common}><path d="M14.5 6.5a4.5 4.5 0 0 0-6 5.8L3.8 17a2.3 2.3 0 0 0 3.2 3.2l4.7-4.7a4.5 4.5 0 0 0 5.8-6l-2.8 2.8-3-3 2.8-2.8Z"/></svg>;
    case "note":
      return <svg {...common}><path d="M6 3h9l3 3v15H6V3Z"/><path d="M14 3v4h4M9 12h6M9 16h5"/></svg>;
    case "star":
      return <svg {...common}><path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3Z"/></svg>;
    case "audio":
      return <svg {...common}><path d="M5 10v4M9 7v10M13 4v16M17 8v8M21 10v4"/></svg>;
    case "person":
      return <svg {...common}><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>;
    case "reset":
      return <svg {...common}><path d="M5 8V3m0 0h5M5 3l3.1 3.1A8 8 0 1 1 4 13"/></svg>;
    case "close":
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
    case "arrow":
      return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
    case "check":
      return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
    case "source":
      return <svg {...common}><path d="M4 5h11v14H4zM15 8h5v11H9"/><path d="M7 9h5M7 13h5"/></svg>;
    case "archive":
    default:
      return <svg {...common}><path d="M4 7h16v13H4zM3 3h18v4H3z"/><path d="M9 11h6"/></svg>;
  }
}

function AudioSource({ source }: { source: Source }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasTimecode = source.timeStartSeconds !== undefined;
  const start = source.timeStartSeconds ?? 0;
  const end = source.timeEndSeconds;

  const seekToCitation = () => {
    const player = audioRef.current;
    if (!player || !hasTimecode) return;
    if (player.currentTime < start || (end !== undefined && player.currentTime >= end)) {
      player.currentTime = start;
    }
  };

  return (
    <div className={styles.audioEvidence}>
      <div className={styles.audioWave} aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <i key={index} style={{ height: `${22 + ((index * 17) % 56)}%` }} />
        ))}
      </div>
      {source.assetPath ? (
        <audio
          ref={audioRef}
          className={styles.audioPlayer}
          controls
          preload="metadata"
          src={source.assetPath}
          aria-label={`Play cited audio: ${source.label}`}
          onLoadedMetadata={seekToCitation}
          onPlay={seekToCitation}
          onTimeUpdate={(event) => {
            if (end !== undefined && event.currentTarget.currentTime >= end) {
              event.currentTarget.pause();
            }
          }}
        />
      ) : (
        <p className={styles.unavailable}>Audio file is not included in this archive.</p>
      )}
      <p className={styles.timecode}>
        {hasTimecode ? (
          <>Cited segment&nbsp; {formatTime(start)}{end !== undefined ? `–${formatTime(end)}` : "+"}</>
        ) : (
          <>Full original audio · no cited time range</>
        )}
      </p>
    </div>
  );
}

function PhotoSource({ source }: { source: Source }) {
  const [aspectRatio, setAspectRatio] = useState<number>();
  const wholePhoto = source.region &&
    source.region.x === 0 && source.region.y === 0 && source.region.width === 1 && source.region.height === 1;

  return (
    <div className={styles.photoEvidence} style={{ aspectRatio }}>
      {source.assetPath ? (
        <Image
          src={source.assetPath}
          alt={`Archive preview for ${source.label}`}
          fill
          sizes="(max-width: 760px) 84vw, 360px"
          unoptimized
          onLoad={(event) => {
            const { naturalHeight, naturalWidth } = event.currentTarget;
            if (naturalHeight > 0) setAspectRatio(naturalWidth / naturalHeight);
          }}
        />
      ) : (
        <div className={styles.missingPhoto}>Archive image withheld</div>
      )}
      {source.region ? (
        <span
          className={styles.sourceRegion}
          style={{
            left: `${source.region.x * 100}%`,
            top: `${source.region.y * 100}%`,
            width: `${source.region.width * 100}%`,
            height: `${source.region.height * 100}%`,
          }}
        >
          <span>{wholePhoto ? "cited full photo" : "cited region"}</span>
        </span>
      ) : null}
    </div>
  );
}

function SourceCard({ source }: { source: Source }) {
  return (
    <article className={styles.sourceCard}>
      <header className={styles.sourceCardHeader}>
        <span className={styles.sourceKind} data-kind={source.kind}>
          <MiniIcon
            name={source.kind === "photo" ? "camera" : source.kind === "audio" ? "audio" : "person"}
          />
          {sourceTypeLabel(source)}
        </span>
        <span className={styles.sourceId}>#{source.id}</span>
      </header>
      <h4>{source.label}</h4>
      {source.capturedAt ? <p className={styles.capturedAt}>{source.capturedAt}</p> : null}
      {source.kind === "photo" ? <PhotoSource source={source} /> : null}
      {source.kind === "audio" ? <AudioSource source={source} /> : null}
      {source.kind === "human" ? (
        <div className={styles.humanSeal} data-human-role={source.humanRole}>
          <span aria-hidden="true"><MiniIcon name="person" /></span>
          <p>{humanReviewSeal(source)}</p>
        </div>
      ) : null}
      {source.excerpt ? <blockquote>“{source.excerpt}”</blockquote> : null}
    </article>
  );
}

function ClaimsList({ claims }: { claims: GroundedClaim[] }) {
  return (
    <div className={styles.claimsList}>
      <p className={styles.microHeading}>What this moment claims</p>
      {claims.map((claim) => (
        <div className={styles.claim} key={claim.id} data-status={claim.status}>
          <span className={styles.claimMark} aria-hidden="true">
            {claim.status === "uncertain" ? "?" : <MiniIcon name="check" />}
          </span>
          <div>
            <p>{claim.text}</p>
            <small>{claimStatusLabel(claim)}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function SourceDrawer({
  open,
  sources,
  onClose,
}: {
  open: boolean;
  sources: Source[];
  onClose: () => void;
}) {
  return (
    <aside
      className={styles.sourceDrawer}
      data-open={open}
      role="dialog"
      aria-modal="true"
      aria-label="Source archive"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not([disabled]), audio[controls], a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
          ),
        );
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className={styles.drawerHandle} aria-hidden="true" />
      <header className={styles.drawerHeader}>
        <div>
          <p className={styles.archiveKicker}>The receipts</p>
          <h3>Source archive</h3>
        </div>
        <button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close source archive" autoFocus>
          <MiniIcon name="close" />
        </button>
      </header>
      <p className={styles.drawerIntro}>
        Every factual detail resolves here. Generated scenery is interpretation, never evidence.
      </p>
      <div className={styles.sourceStack}>
        {sources.map((source) => <SourceCard source={source} key={source.id} />)}
      </div>
    </aside>
  );
}

export function ExhibitPlayer({ manifest, onExit }: ExhibitPlayerProps) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [progress, setProgress] = useState<Record<string, SceneProgress>>(() => createProgress(manifest));
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flatView, setFlatView] = useState(false);
  const [feedback, setFeedback] = useState("Choose a glowing memory marker to begin.");
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);

  const scene = manifest.scenes[sceneIndex] ?? manifest.scenes[0];
  const sceneProgress = progress[scene.id] ?? EMPTY_PROGRESS;
  const selectedHotspot = scene.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? null;

  const sourceMap = useMemo(
    () => new Map(manifest.sources.map((source) => [source.id, source])),
    [manifest.sources],
  );
  const claimMap = useMemo(
    () => new Map(manifest.claims.map((claim) => [claim.id, claim])),
    [manifest.claims],
  );

  const activeSourceIds = selectedHotspot?.sourceIds ?? scene.sourceIds;
  const activeSources = activeSourceIds.flatMap((id) => {
    const source = sourceMap.get(id);
    return source ? [source] : [];
  });
  const activeClaims = selectedHotspot
    ? selectedHotspot.claimIds.flatMap((id) => {
        const claim = claimMap.get(id);
        return claim ? [claim] : [];
      })
    : [];

  const completedScenes = manifest.scenes.filter((item) => progress[item.id]?.complete).length;
  const exhibitComplete = completedScenes === manifest.scenes.length;
  const interactionTotal = scene.interaction.kind === "collect"
    ? scene.interaction.targetHotspotIds.length
    : scene.interaction.stepHotspotIds.length;
  const interactionDone = scene.interaction.kind === "collect"
    ? sceneProgress.collectedIds.length
    : sceneProgress.sequenceIndex;

  const goToScene = (nextIndex: number) => {
    const safeIndex = Math.max(0, Math.min(nextIndex, manifest.scenes.length - 1));
    setSceneIndex(safeIndex);
    setSelectedHotspotId(null);
    setDrawerOpen(false);
    setFlatView(false);
    setFeedback("Choose a glowing memory marker to begin.");
  };

  const openSourceDrawer = () => {
    if (document.activeElement instanceof HTMLElement) {
      drawerReturnFocusRef.current = document.activeElement;
    }
    setDrawerOpen(true);
  };

  const closeSourceDrawer = () => {
    setDrawerOpen(false);
    const returnTarget = drawerReturnFocusRef.current;
    window.requestAnimationFrame(() => returnTarget?.focus());
  };

  const handleHotspot = (hotspot: Hotspot) => {
    setSelectedHotspotId(hotspot.id);

    if (sceneProgress.complete) {
      setFeedback("This scene is complete. You can still inspect every memory and source.");
      return;
    }

    if (scene.interaction.kind === "collect") {
      const isTarget = scene.interaction.targetHotspotIds.includes(hotspot.id);
      if (!isTarget) {
        setFeedback(`${hotspot.shortLabel} is part of the scene, but not one of this prompt’s keepsakes.`);
        return;
      }
      if (sceneProgress.collectedIds.includes(hotspot.id)) {
        setFeedback(`${hotspot.shortLabel} is already in your keepsake trail.`);
        return;
      }

      const collectedIds = [...sceneProgress.collectedIds, hotspot.id];
      const complete = collectedIds.length === scene.interaction.targetHotspotIds.length;
      setProgress((current) => ({
        ...current,
        [scene.id]: { ...sceneProgress, collectedIds, complete },
      }));
      setFeedback(complete ? scene.interaction.completionMessage : `${hotspot.shortLabel} collected — ${collectedIds.length} of ${interactionTotal}.`);
      return;
    }

    const expectedId = scene.interaction.stepHotspotIds[sceneProgress.sequenceIndex];
    if (hotspot.id !== expectedId) {
      setProgress((current) => ({
        ...current,
        [scene.id]: { ...sceneProgress, sequenceIndex: 0, complete: false },
      }));
      setFeedback(scene.interaction.retryMessage);
      return;
    }

    const sequenceIndex = sceneProgress.sequenceIndex + 1;
    const complete = sequenceIndex === scene.interaction.stepHotspotIds.length;
    setProgress((current) => ({
      ...current,
      [scene.id]: { ...sceneProgress, sequenceIndex, complete },
    }));
    setFeedback(complete ? scene.interaction.successMessage : `${hotspot.shortLabel} is right. Now find step ${sequenceIndex + 1}.`);
  };

  const resetExhibit = () => {
    setProgress(createProgress(manifest));
    setSceneIndex(0);
    setSelectedHotspotId(null);
    setDrawerOpen(false);
    setFlatView(false);
    setFeedback("The exhibit has been reset. Choose a glowing memory marker to begin.");
  };

  const hotspotState = (hotspot: Hotspot): "complete" | "next" | "idle" => {
    if (scene.interaction.kind === "collect") {
      return sceneProgress.collectedIds.includes(hotspot.id) ? "complete" : "idle";
    }
    const position = scene.interaction.stepHotspotIds.indexOf(hotspot.id);
    if (position >= 0 && position < sceneProgress.sequenceIndex) return "complete";
    if (position === sceneProgress.sequenceIndex) return "next";
    return "idle";
  };

  const theme = {
    "--exhibit-ink": manifest.palette.ink,
    "--exhibit-paper": manifest.palette.paper,
    "--exhibit-accent": manifest.palette.accent,
    "--exhibit-glow": manifest.palette.glow,
  } as CSSProperties;

  return (
    <section
      className={styles.player}
      style={theme}
      aria-label={`${manifest.title} playable exhibit`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (drawerOpen) {
            event.preventDefault();
            closeSourceDrawer();
          } else {
            setSelectedHotspotId(null);
          }
        }
      }}
    >
      <header className={styles.playerHeader}>
        <div className={styles.brandLockup}>
          {onExit ? (
            <button className={styles.backButton} type="button" onClick={onExit}>
              <span aria-hidden="true">←</span> Keepscape
            </button>
          ) : <span className={styles.wordmark}>Keepscape</span>}
          <span className={styles.headerRule} aria-hidden="true" />
          <div>
            <p>{manifest.dedication}</p>
            <strong>{manifest.title}</strong>
          </div>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.truthChip}><MiniIcon name="source" /> Traceable story</span>
          <button className={styles.resetButton} type="button" onClick={resetExhibit}>
            <MiniIcon name="reset" /> Reset
          </button>
        </div>
      </header>

      <div className={styles.exhibitGrid}>
        <aside className={styles.sceneRail} aria-label="Exhibit scenes">
          <div className={styles.railIntro}>
            <p className={styles.archiveKicker}>Playable archive</p>
            <h1>{manifest.title}</h1>
            <p>{manifest.subtitle}</p>
          </div>
          <nav className={styles.sceneNav}>
            {manifest.scenes.map((item, index) => {
              const complete = progress[item.id]?.complete ?? false;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.sceneTab}
                  data-active={index === sceneIndex}
                  data-complete={complete}
                  onClick={() => goToScene(index)}
                  aria-current={index === sceneIndex ? "step" : undefined}
                >
                  <span className={styles.sceneNumber}>{complete ? <MiniIcon name="check" /> : String(index + 1).padStart(2, "0")}</span>
                  <span><small>{item.eyebrow}</small>{item.title}</span>
                </button>
              );
            })}
          </nav>
          <div className={styles.truthNote}>
            <MiniIcon name="archive" />
            <p><strong>Archive promise</strong>{manifest.truthNote}</p>
          </div>
        </aside>

        <main className={styles.scenePanel}>
          <div className={styles.sceneHeading}>
            <div>
              <p className={styles.sceneEyebrow}>{scene.eyebrow} · scene {sceneIndex + 1}/{manifest.scenes.length}</p>
              <h2>{scene.title}</h2>
            </div>
            <div className={styles.sceneTools}>
              <span className={styles.interpretationBadge}>
                <i /> {scene.spatial ? "Generated spatial interpretation" : "Generated interpretation"}
              </span>
              {scene.spatial && flatView ? (
                <button className={styles.sourceButton} type="button" onClick={() => setFlatView(false)}>
                  Enter spatial view
                </button>
              ) : null}
              <button className={styles.sourceButton} type="button" onClick={openSourceDrawer}>
                <MiniIcon name="source" /> Sources <span>{activeSources.length}</span>
              </button>
            </div>
          </div>

          <div className={styles.stageShell}>
            {scene.spatial && !flatView ? (
              <SpatialStage
                scene={scene}
                sources={manifest.sources}
                selectedHotspotId={selectedHotspotId}
                hotspotStates={Object.fromEntries(scene.hotspots.map((hotspot) => [hotspot.id, hotspotState(hotspot)]))}
                onHotspot={handleHotspot}
                onRequestFlat={() => setFlatView(true)}
              />
            ) : (
              <div
                className={styles.stage}
                data-stage={scene.stage}
                style={{ backgroundImage: `url(${stageArt[scene.stage]})` }}
                aria-label={`Interactive illustrated scene: ${scene.title}`}
              >
                <div className={styles.stageWash} aria-hidden="true" />
                <div className={styles.stageCaption}>
                  <p>{scene.narration}</p>
                  <span>Scenery generated around approved source material</span>
                </div>
                {scene.hotspots.map((hotspot, index) => {
                  const state = hotspotState(hotspot);
                  const selected = selectedHotspotId === hotspot.id;
                  return (
                    <button
                      type="button"
                      key={hotspot.id}
                      className={styles.hotspot}
                      data-state={state}
                      data-selected={selected}
                      style={{
                        left: `${hotspot.xPercent}%`,
                        top: `${hotspot.yPercent}%`,
                        "--hotspot-scale": hotspot.scale,
                        "--hotspot-delay": `${index * 90}ms`,
                      } as CSSProperties}
                      onClick={() => handleHotspot(hotspot)}
                      aria-label={`${hotspot.shortLabel}${state === "complete" ? ", completed" : state === "next" ? ", next in sequence" : ""}`}
                      aria-pressed={selected}
                    >
                      <span className={styles.hotspotHalo} aria-hidden="true" />
                      <span className={styles.hotspotIcon}>{state === "complete" ? <MiniIcon name="check" /> : <MiniIcon name={hotspot.icon} />}</span>
                      <span className={styles.hotspotLabel}>{hotspot.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <section className={styles.missionCard} aria-label="Scene activity">
              <div className={styles.missionTopline}>
                <span>{scene.interaction.kind === "collect" ? "Keepsake trail" : "Put the memory in order"}</span>
                <strong>{Math.min(interactionDone, interactionTotal)}/{interactionTotal}</strong>
              </div>
              <div className={styles.progressTrack} aria-hidden="true">
                <i style={{ width: `${(Math.min(interactionDone, interactionTotal) / interactionTotal) * 100}%` }} />
              </div>
              <p className={styles.prompt}>{scene.interaction.prompt}</p>
              <p className={styles.feedback} aria-live="polite">{feedback}</p>
              <div className={styles.missionFooter}>
                <span>{sceneProgress.complete ? <><MiniIcon name="check" /> Scene remembered</> : "Tap a marker · inspect its source"}</span>
                {sceneProgress.complete && sceneIndex < manifest.scenes.length - 1 ? (
                  <button type="button" onClick={() => goToScene(sceneIndex + 1)}>Next scene <MiniIcon name="arrow" /></button>
                ) : null}
              </div>
            </section>
          </div>

          {selectedHotspot ? (
            <article className={styles.memoryCard}>
              <button className={styles.memoryClose} type="button" onClick={() => setSelectedHotspotId(null)} aria-label="Close memory detail">
                <MiniIcon name="close" />
              </button>
              <div className={styles.memoryIndex}>
                <span><MiniIcon name={selectedHotspot.icon} /></span>
                Memory object · {selectedHotspot.shortLabel}
              </div>
              <div className={styles.memoryBody}>
                <div>
                  <h3>{selectedHotspot.title}</h3>
                  <p>{selectedHotspot.body}</p>
                  {selectedHotspot.interpretation ? (
                    <p className={styles.interpretationNote}>
                      <span>Generated interpretation</span>{selectedHotspot.interpretation}
                    </p>
                  ) : null}
                  <button className={styles.openSources} type="button" onClick={openSourceDrawer}>
                    Trace to {activeSources.length} source{activeSources.length === 1 ? "" : "s"} <MiniIcon name="arrow" />
                  </button>
                </div>
                <ClaimsList claims={activeClaims} />
              </div>
            </article>
          ) : null}

          <footer className={styles.playerFooter}>
            <div className={styles.exhibitProgress}>
              <span>{exhibitComplete ? "Archive trail complete" : `${completedScenes} of ${manifest.scenes.length} scenes remembered`}</span>
              <div aria-hidden="true">{manifest.scenes.map((item) => <i key={item.id} data-complete={progress[item.id]?.complete ?? false} />)}</div>
            </div>
            <p>Factual details carry receipts. Imagination carries a label.</p>
          </footer>
        </main>
      </div>

      {drawerOpen ? (
        <>
          <button className={styles.drawerScrim} type="button" onClick={closeSourceDrawer} aria-label="Close source archive" />
          <SourceDrawer open sources={activeSources} onClose={closeSourceDrawer} />
        </>
      ) : null}
    </section>
  );
}

export default ExhibitPlayer;
