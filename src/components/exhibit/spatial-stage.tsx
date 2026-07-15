"use client";

import Image from "next/image";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Eye,
  Image as ImageIcon,
  MapPin,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import type { ExhibitScene, GroundedClaim, Hotspot, Source, SpatialPlane } from "@/lib/exhibit-schema";

import styles from "./spatial-stage.module.css";

type HotspotState = "complete" | "next" | "idle";

export interface SpatialStageProps {
  scene: ExhibitScene;
  claims: GroundedClaim[];
  sources: Source[];
  selectedHotspotId: string | null;
  hotspotStates: Record<string, HotspotState>;
  lensActive: boolean;
  onLensChange: (active: boolean) => void;
  onHotspot: (hotspot: Hotspot) => void;
  onOpenSources: () => void;
  onRequestFlat: () => void;
}

type DragOrigin = {
  x: number;
  y: number;
  yaw: number;
  depth: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function formatTime(seconds: number | undefined): string {
  if (seconds === undefined) return "Full recording";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatAudioCitation(source: Source): string {
  const label = source.label.split(" · ")[0];
  const start = source.timeStartSeconds;
  const end = source.timeEndSeconds;
  if (start === undefined) return `${label} · full recording`;
  if (end === undefined) return `${label} · from ${formatTime(start)}`;
  return `${label} · ${formatTime(start)}–${formatTime(end)}`;
}

function humanDecisionLabel(source: Source | undefined, claims: GroundedClaim[]): string {
  if (!source) return "No added claim";
  if (source.humanRole === "confirmation") {
    const confirmedClaim = claims.find((claim) => claim.id === source.confirmedClaimId);
    return confirmedClaim ? `Confirmed · ${confirmedClaim.text}` : "Human confirmation recorded";
  }
  if (source.humanRole === "uncertainty-preserved") return "Kept uncertain · not confirmed as fact";
  if (source.humanRole === "story-note") return "Human account cited · not a confirmation";
  return "Generated wording reviewed · not a factual confirmation";
}

function Plane({
  plane,
  source,
  hotspots,
  hotspotStates,
  selectedHotspotId,
  lensActive,
  onHotspot,
}: {
  plane: SpatialPlane;
  source?: Source;
  hotspots: Hotspot[];
  hotspotStates: Record<string, HotspotState>;
  selectedHotspotId: string | null;
  lensActive: boolean;
  onHotspot: (hotspot: Hotspot) => void;
}) {
  const [aspectRatio, setAspectRatio] = useState(3 / 2);
  const selectedHotspot = hotspots.find((hotspot) => hotspot.id === selectedHotspotId);
  const revealRegion = lensActive && selectedHotspot && source?.region;
  const regionLabel = revealRegion &&
    (revealRegion.x > 0 || revealRegion.y > 0 || revealRegion.width < 1 || revealRegion.height < 1)
    ? "cited photo region"
    : "cited source view";
  const planeStyle = {
    "--plane-aspect": aspectRatio,
  } as CSSProperties;

  return (
    <article
      className={styles.plane}
      data-slot={plane.slot}
      data-active={Boolean(selectedHotspot)}
      style={planeStyle}
      aria-label={`Spatial source plane: ${source?.label ?? plane.sourceId}`}
    >
      <div className={styles.photoMount}>
        {source?.assetPath ? (
          <Image
            src={source.assetPath}
            alt={`Source view for ${source.label}`}
            fill
            sizes="(max-width: 760px) 78vw, 560px"
            unoptimized
            onLoad={(event) => {
              const { naturalHeight, naturalWidth } = event.currentTarget;
              if (naturalHeight > 0) setAspectRatio(naturalWidth / naturalHeight);
            }}
          />
        ) : (
          <span className={styles.missingPhoto}>Source image unavailable</span>
        )}
        <span className={styles.photoShade} aria-hidden="true" />
        {hotspots.map((hotspot) => {
          const anchor = hotspot.spatialAnchor;
          if (!anchor) return null;
          const state = hotspotStates[hotspot.id] ?? "idle";
          return (
            <button
              className={styles.anchor}
              data-selected={hotspot.id === selectedHotspotId}
              data-state={state}
              key={hotspot.id}
              type="button"
              style={{ left: `${anchor.u * 100}%`, top: `${anchor.v * 100}%` }}
              onClick={() => onHotspot(hotspot)}
              aria-label={hotspot.shortLabel}
              aria-pressed={hotspot.id === selectedHotspotId}
            >
              <span>{state === "complete" ? <Check size={15} aria-hidden="true" /> : <MapPin size={15} aria-hidden="true" />}</span>
              <small>{hotspot.shortLabel}</small>
            </button>
          );
        })}
        {revealRegion ? (
          <>
            <span
              className={styles.evidenceRegion}
              style={{
                left: `${revealRegion.x * 100}%`,
                top: `${revealRegion.y * 100}%`,
                width: `${revealRegion.width * 100}%`,
                height: `${revealRegion.height * 100}%`,
              }}
            >
              <span>{regionLabel}</span>
            </span>
            <svg className={styles.tether} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line
                x1={(revealRegion.x + revealRegion.width / 2) * 100}
                y1={(revealRegion.y + revealRegion.height / 2) * 100}
                x2="94"
                y2="91"
              />
              <circle cx="94" cy="91" r="1.4" />
            </svg>
          </>
        ) : null}
      </div>
      <footer>
        <span>Source plane</span>
        <strong>{source?.label ?? plane.sourceId}</strong>
      </footer>
    </article>
  );
}

function SourcePortal({ source }: { source: Source }) {
  const [aspectRatio, setAspectRatio] = useState(3 / 2);
  const wholePhoto = source.region &&
    source.region.x === 0 && source.region.y === 0 && source.region.width === 1 && source.region.height === 1;
  const photoLabel = source.region ? (wholePhoto ? "Full photo view" : "Photo region") : "Photo source view";

  return (
    <figure className={styles.sourcePortal}>
      <div className={styles.sourcePortalImage} style={{ aspectRatio }}>
        <Image
          src={source.assetPath ?? ""}
          alt={`Source archive view: ${source.label}`}
          fill
          sizes="420px"
          unoptimized
          onLoad={(event) => {
            const { naturalHeight, naturalWidth } = event.currentTarget;
            if (naturalHeight > 0) setAspectRatio(naturalWidth / naturalHeight);
          }}
        />
        {source.region ? (
          <span
            className={styles.sourcePortalRegion}
            style={{
              left: `${source.region.x * 100}%`,
              top: `${source.region.y * 100}%`,
              width: `${source.region.width * 100}%`,
              height: `${source.region.height * 100}%`,
            }}
          >
            Source match
          </span>
        ) : null}
      </div>
      <figcaption>
        <span><ImageIcon size={12} aria-hidden="true" /> {photoLabel}</span>
        <strong>{source.label}</strong>
      </figcaption>
    </figure>
  );
}

export function SpatialStage({
  scene,
  claims,
  sources,
  selectedHotspotId,
  hotspotStates,
  lensActive,
  onLensChange,
  onHotspot,
  onOpenSources,
  onRequestFlat,
}: SpatialStageProps) {
  const spatial = scene.spatial;
  const [depth, setDepth] = useState(0);
  const [yaw, setYaw] = useState(0);
  const dragOrigin = useRef<DragOrigin | null>(null);
  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);

  if (!spatial) return null;

  const hotspotsByPlane = new Map<string, Hotspot[]>();
  const voiceHotspots: Hotspot[] = [];
  for (const hotspot of scene.hotspots) {
    const planeId = hotspot.spatialAnchor?.planeId;
    if (!planeId) {
      voiceHotspots.push(hotspot);
      continue;
    }
    hotspotsByPlane.set(planeId, [...(hotspotsByPlane.get(planeId) ?? []), hotspot]);
  }

  const selectedHotspot = scene.hotspots.find((hotspot) => hotspot.id === selectedHotspotId);
  const selectedPlane = spatial.planes.find((plane) => plane.id === selectedHotspot?.spatialAnchor?.planeId);
  const selectedSource = selectedPlane ? sourceById.get(selectedPlane.sourceId) : undefined;
  const selectedAudioSource = selectedHotspot?.sourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .find((source) => source?.kind === "audio");
  const selectedHumanSources = selectedHotspot?.sourceIds
    .map((sourceId) => sourceById.get(sourceId))
    .filter((source): source is Source => source?.kind === "human") ?? [];
  const selectedHumanSource =
    selectedHumanSources.find((source) => source.humanRole === "confirmation") ??
    selectedHumanSources.find((source) => source.humanRole === "uncertainty-preserved") ??
    selectedHumanSources.find((source) => source.humanRole === "story-note") ??
    selectedHumanSources[0];
  const interactionIds = scene.interaction.kind === "collect"
    ? scene.interaction.targetHotspotIds
    : scene.interaction.stepHotspotIds;
  const completedInteractionCount = interactionIds.filter(
    (hotspotId) => hotspotStates[hotspotId] === "complete",
  ).length;
  const sceneComplete = interactionIds.length > 0 && completedInteractionCount === interactionIds.length;
  const previewPlane = spatial.planes.find((plane) => plane.slot === "far-center") ?? spatial.planes[0];
  const previewSource = previewPlane ? sourceById.get(previewPlane.sourceId) : undefined;
  const voiceOnly = voiceHotspots.every((hotspot) =>
    hotspot.sourceIds.every((sourceId) => sourceById.get(sourceId)?.kind !== "photo"),
  );
  const visualSourceLabel = selectedSource
    ? selectedSource.region
      ? "Region matched"
      : "Source view cited"
    : "Waiting";
  const humanLabel = humanDecisionLabel(selectedHumanSource, claims);
  const supportTypes = [selectedSource ? "photo" : null, selectedAudioSource ? "cited audio" : null]
    .filter((value): value is string => Boolean(value));
  const supportStatement = supportTypes.length === 2
    ? "The photo and cited audio support this detail."
    : supportTypes.length === 1
      ? `The ${supportTypes[0]} supports this detail.`
      : selectedHumanSource
        ? "The human decision is recorded for this detail."
        : "Select an object to inspect its evidence.";
  const sceneCompletionMessage = scene.interaction.kind === "collect"
    ? scene.interaction.completionMessage
    : scene.interaction.successMessage;
  const sceneCompletionHeadline = sceneCompletionMessage.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()
    ?? sceneCompletionMessage;
  const worldStyle = {
    "--camera-depth": `${depth * 142}px`,
    "--camera-yaw": `${yaw * 14}deg`,
  } as CSSProperties;

  const moveDepth = (delta: number) => setDepth((current) => clamp(Math.round(current + delta), 0, 2));
  const moveYaw = (delta: number) => setYaw((current) => clamp(current + delta, -1, 1));

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    dragOrigin.current = { x: event.clientX, y: event.clientY, yaw, depth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    setYaw(clamp(origin.yaw + (event.clientX - origin.x) / 260, -1, 1));
    setDepth(clamp(origin.depth - (event.clientY - origin.y) / 180, 0, 2));
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragOrigin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) < 12) return;
    event.preventDefault();
    moveDepth(event.deltaY > 0 ? 1 : -1);
  };

  return (
    <section className={styles.spatialStage} aria-label={`Generated spatial interpretation: ${scene.title}`}>
      <div className={styles.spatialHeader}>
        <span className={styles.spatialChip}>Generated space · traceable story</span>
        <div className={styles.headerActions}>
          <button
            className={styles.lensButton}
            data-active={lensActive}
            type="button"
            onClick={() => onLensChange(!lensActive)}
            aria-pressed={lensActive}
          >
            <Eye size={15} aria-hidden="true" /> {lensActive ? "Evidence Lens on" : "Turn on Evidence Lens"}
          </button>
          <button className={styles.flatButton} type="button" onClick={onRequestFlat}>View flat exhibit</button>
        </div>
      </div>

      <div
        className={styles.viewport}
        data-lens={lensActive}
        data-complete={sceneComplete}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onWheel={handleWheel}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveDepth(1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            moveDepth(-1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveYaw(-0.5);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            moveYaw(0.5);
          }
        }}
        aria-label="Walkable photo diorama. Use arrow keys or the camera controls to move."
      >
        <div className={styles.generatedWorld} aria-hidden="true">
          <span
            className={styles.portalPreview}
            style={{ backgroundImage: previewSource?.assetPath ? `url(${previewSource.assetPath})` : undefined }}
          />
          <span className={styles.ceilingGrid} />
          <span className={styles.floorGrid} />
          <span className={styles.vanishingLight} />
          <span className={styles.memoryHaze} />
          <span className={styles.memoryDust} />
        </div>
        <div className={styles.world} style={worldStyle} data-lens={lensActive} data-preset={spatial.preset}>
          {spatial.planes.map((plane) => (
            <Plane
              key={plane.id}
              plane={plane}
              source={sourceById.get(plane.sourceId)}
              hotspots={hotspotsByPlane.get(plane.id) ?? []}
              hotspotStates={hotspotStates}
              selectedHotspotId={selectedHotspotId}
              lensActive={lensActive}
              onHotspot={onHotspot}
            />
          ))}
        </div>

        <div className={styles.sceneCaption}>
          <span>Walkable photo diorama · view {Math.round(depth) + 1}/3</span>
          <p>{scene.narration}</p>
        </div>

        {lensActive ? (
          <aside className={styles.truthThread} aria-live="polite" aria-label="Evidence Lens truth thread">
            <header className={styles.truthThreadHeader}>
              <span><ShieldCheck size={14} aria-hidden="true" /> Truth Thread</span>
              <small>Evidence Lens active</small>
              <strong>Every detail has a way home.</strong>
            </header>

            {selectedSource?.kind === "photo" && selectedSource.assetPath ? (
              <SourcePortal source={selectedSource} />
            ) : (
              <div className={styles.emptyPortal}>
                <MapPin size={22} aria-hidden="true" />
                <strong>Select a glowing object</strong>
                <span>Its original evidence will appear here.</span>
              </div>
            )}

            <div className={styles.evidenceChain}>
              <div data-present={Boolean(selectedSource)}>
                <span>01</span>
                <p><small>Visual source</small><strong>{visualSourceLabel}</strong></p>
              </div>
              <div data-present={Boolean(selectedAudioSource)}>
                <span>02</span>
                <p>
                  <small>Cited audio</small>
                  <strong>
                    {selectedAudioSource
                      ? formatAudioCitation(selectedAudioSource)
                      : "Not cited"}
                  </strong>
                </p>
                <i className={styles.waveform} aria-hidden="true">
                  {Array.from({ length: 11 }, (_, index) => <b key={index} />)}
                </i>
              </div>
              <div data-present={Boolean(selectedHumanSource)}>
                <span>03</span>
                <p><small>Human decision</small><strong>{humanLabel}</strong></p>
              </div>
            </div>

            <p className={styles.truthBoundary}>{supportStatement} Placement, depth and motion remain interpretation.</p>
            <button className={styles.openArchiveButton} type="button" onClick={onOpenSources}>
              Open full source archive <ArrowRight size={14} aria-hidden="true" />
            </button>
          </aside>
        ) : null}

        {lensActive && selectedSource ? (
          <svg className={styles.truthThreadLine} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M 48 36 C 61 30, 64 42, 76 42" />
            <circle cx="48" cy="36" r="1" />
            <circle cx="76" cy="42" r="1" />
          </svg>
        ) : null}

        {sceneComplete ? (
          <div className={styles.completionBloom} role="status">
            <span>{completedInteractionCount}/{interactionIds.length} · archive awakened</span>
            <strong>{sceneCompletionHeadline}</strong>
          </div>
        ) : null}

        <nav className={styles.cameraControls} aria-label="Spatial camera controls">
          <button type="button" onClick={() => moveYaw(-0.5)} disabled={yaw <= -1} aria-label="Look left">
            <ArrowLeft size={15} aria-hidden="true" /><span>Look left</span>
          </button>
          <button type="button" onClick={() => moveDepth(1)} disabled={depth >= 2} aria-label="Move deeper">
            <ArrowUp size={15} aria-hidden="true" /><span>Move in</span>
          </button>
          <button type="button" onClick={() => moveDepth(-1)} disabled={depth <= 0} aria-label="Move back">
            <ArrowDown size={15} aria-hidden="true" /><span>Step back</span>
          </button>
          <button type="button" onClick={() => moveYaw(0.5)} disabled={yaw >= 1} aria-label="Look right">
            <ArrowRight size={15} aria-hidden="true" /><span>Look right</span>
          </button>
        </nav>

        <span className={styles.dragHint}>Drag to look · scroll or ↑↓ to move</span>
      </div>

      {voiceHotspots.length > 0 ? (
        <div className={styles.voiceRail} aria-label={voiceOnly ? "Voice-only memory objects" : "Unplaced memory objects"}>
          <span>
            {voiceOnly ? <Volume2 size={14} aria-hidden="true" /> : <MapPin size={14} aria-hidden="true" />}
            {voiceOnly ? "Voice-memory anchors" : "Unplaced memory anchors"}
          </span>
          <div>
            {voiceHotspots.map((hotspot) => (
              <button
                key={hotspot.id}
                type="button"
                data-state={hotspotStates[hotspot.id] ?? "idle"}
                data-selected={hotspot.id === selectedHotspotId}
                onClick={() => onHotspot(hotspot)}
                aria-label={hotspot.shortLabel}
                aria-pressed={hotspot.id === selectedHotspotId}
              >
                {hotspotStates[hotspot.id] === "complete" ? <Check size={13} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}
                {hotspot.shortLabel}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className={styles.disclaimer}>{spatial.disclaimer}</p>
    </section>
  );
}
