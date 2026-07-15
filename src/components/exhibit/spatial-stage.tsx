"use client";

import Image from "next/image";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Eye, MapPin, Volume2 } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

import type { ExhibitScene, Hotspot, Source, SpatialPlane } from "@/lib/exhibit-schema";

import styles from "./spatial-stage.module.css";

type HotspotState = "complete" | "next" | "idle";

export interface SpatialStageProps {
  scene: ExhibitScene;
  sources: Source[];
  selectedHotspotId: string | null;
  hotspotStates: Record<string, HotspotState>;
  onHotspot: (hotspot: Hotspot) => void;
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

export function SpatialStage({
  scene,
  sources,
  selectedHotspotId,
  hotspotStates,
  onHotspot,
  onRequestFlat,
}: SpatialStageProps) {
  const spatial = scene.spatial;
  const [depth, setDepth] = useState(0);
  const [yaw, setYaw] = useState(0);
  const [lensActive, setLensActive] = useState(false);
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
  const voiceOnly = voiceHotspots.every((hotspot) =>
    hotspot.sourceIds.every((sourceId) => sourceById.get(sourceId)?.kind !== "photo"),
  );
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
            onClick={() => setLensActive((current) => !current)}
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
          <span className={styles.ceilingGrid} />
          <span className={styles.floorGrid} />
          <span className={styles.vanishingLight} />
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
          <div className={styles.lensReceipt} aria-live="polite">
            <span>Evidence Lens active</span>
            <strong>{selectedSource?.label ?? "Select a sourced object"}</strong>
            <p>Citation points to this source · placement, depth and motion are interpretation.</p>
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
