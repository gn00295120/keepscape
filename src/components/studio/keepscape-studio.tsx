"use client";

import { type ChangeEvent, type CSSProperties, type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  FileAudio,
  LockKeyhole,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { ExhibitPlayer } from "@/components/exhibit/exhibit-player";
import { sampleExhibits } from "@/lib/sample-exhibits";
import type { ExhibitManifest } from "@/lib/exhibit-schema";
import {
  applyHumanConfirmations,
  recordInteractionCopyReview,
  recordSourceDeskReview,
} from "@/lib/human-review";

import { BuildTrail } from "./build-trail";
import { SourceDesk } from "./source-desk";
import { StageRail, type StudioStage } from "./stage-rail";

type ApiEnvelope = {
  ok: boolean;
  mode?: "demo" | "live";
  manifest?: ExhibitManifest;
  reason?: string;
  error?: string;
  trace?: Array<{
    agent: "GPT-5.6" | "Codex" | "Truth gate" | "Typed runtime";
    action: string;
    status: "passed" | "demo" | "fallback";
  }>;
};

type PreviewFile = { file: File; url: string };

function MiniatureScene({ manifest, index }: { manifest: ExhibitManifest; index: number }) {
  const scene = manifest.scenes[0];
  const style = {
    "--mini-ink": manifest.palette.ink,
    "--mini-paper": manifest.palette.paper,
    "--mini-accent": manifest.palette.accent,
    "--mini-glow": manifest.palette.glow,
  } as CSSProperties;

  if (scene.spatial) {
    const sourcesById = new Map(manifest.sources.map((source) => [source.id, source]));
    return (
      <div className="mini-scene mini-scene--spatial" style={style} aria-hidden="true">
        <div className="mini-spatial-world">
          {scene.spatial.planes.map((plane) => {
            const source = sourcesById.get(plane.sourceId);
            return (
              <span
                className="mini-spatial-plane"
                data-slot={plane.slot}
                key={plane.id}
                style={{ backgroundImage: source?.assetPath ? `url(${source.assetPath})` : undefined }}
              />
            );
          })}
          <span className="mini-spatial-floor" />
        </div>
        <span className="mini-spatial-reticle"><i /><i /><i /></span>
        <span className="mini-spatial-note">3 photo views · generated spatial interpretation</span>
        <span className="mini-scene__edition">ARCHIVE {String(index + 1).padStart(2, "0")}</span>
      </div>
    );
  }

  return (
    <div className={`mini-scene mini-scene--${scene.stage}`} style={style} aria-hidden="true">
      <span className="mini-scene__moon" />
      <span className="mini-scene__ground" />
      <span className="mini-scene__prop mini-scene__prop--one" />
      <span className="mini-scene__prop mini-scene__prop--two" />
      <span className="mini-scene__hotspot mini-scene__hotspot--one" />
      <span className="mini-scene__hotspot mini-scene__hotspot--two" />
      <span className="mini-scene__edition">ARCHIVE {String(index + 1).padStart(2, "0")}</span>
    </div>
  );
}

function HeroMemoryCorridor({ manifest }: { manifest: ExhibitManifest }) {
  const scene = manifest.scenes[0];
  if (!scene.spatial) return null;

  const sourcesById = new Map(manifest.sources.map((source) => [source.id, source]));
  const anchoredHotspot = scene.hotspots.find((hotspot) => hotspot.spatialAnchor);
  const anchoredPlaneId = anchoredHotspot?.spatialAnchor?.planeId;

  return (
    <figure className="hero-memory" aria-label="Three source photographs arranged as a generated memory corridor">
      <figcaption className="hero-memory__caption">
        <span>Fictional demo · AI-generated source photos</span>
        <strong>Three photographs become somewhere you can enter.</strong>
      </figcaption>

      <div className="hero-memory__viewport">
        <div className="hero-memory__world" aria-hidden="true">
          {scene.spatial.planes.slice(0, 3).map((plane) => {
            const source = sourcesById.get(plane.sourceId);
            const selected = plane.id === anchoredPlaneId;
            const region = selected ? source?.region : undefined;
            const regionStyle = region
              ? ({
                  "--region-x": `${region.x * 100}%`,
                  "--region-y": `${region.y * 100}%`,
                  "--region-width": `${region.width * 100}%`,
                  "--region-height": `${region.height * 100}%`,
                } as CSSProperties)
              : undefined;

            return (
              <span
                className="hero-memory__plane"
                data-selected={selected}
                data-slot={plane.slot}
                key={plane.id}
                style={{ backgroundImage: source?.assetPath ? `url(${source.assetPath})` : undefined }}
              >
                {region ? (
                  <i className="hero-memory__region" style={regionStyle}>
                    <b>source region</b>
                  </i>
                ) : null}
              </span>
            );
          })}
          <span className="hero-memory__floor" />
        </div>
        <span className="hero-memory__tether" aria-hidden="true" />
        <span className="hero-memory__reticle" aria-hidden="true" />
        <div className="hero-memory__receipt">
          <span>Evidence 01 · painted lantern</span>
          <strong>Demo detail is traceable.</strong>
          <small>Placement, depth and motion are interpretation.</small>
        </div>
      </div>

      <div className="hero-memory__meta" aria-label="Keepscape spatial recipe">
        <span><b>03</b> labeled demo photographs</span>
        <i aria-hidden="true">→</i>
        <span><b>01</b> walkable memory</span>
      </div>
    </figure>
  );
}

export function KeepscapeStudio() {
  const [stage, setStage] = useState<StudioStage>("choose");
  const [manifest, setManifest] = useState<ExhibitManifest>(sampleExhibits[0]);
  const [confirmedClaimIds, setConfirmedClaimIds] = useState<Set<string>>(new Set());
  const [preservedClaimIds, setPreservedClaimIds] = useState<Set<string>>(new Set());
  const [provenanceNotice, setProvenanceNotice] = useState<string>();
  const [imagePreviews, setImagePreviews] = useState<PreviewFile[]>([]);
  const [audioFile, setAudioFile] = useState<File>();
  const [transcript, setTranscript] = useState("");
  const [storyTitle, setStoryTitle] = useState("A family keepsake");
  const [dedication, setDedication] = useState("");
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [liveAnalysisAvailable, setLiveAnalysisAvailable] = useState<boolean | null>(null);
  const [uploadError, setUploadError] = useState<string>();
  const [isMapping, setIsMapping] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);
  const imagePreviewsRef = useRef<PreviewFile[]>([]);
  const audioUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    return () => {
      imagePreviewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url));
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/blueprint", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { liveAnalysisAvailable?: boolean }) => {
        if (!active) return;
        const available = result.liveAnalysisAvailable === true;
        setLiveAnalysisAvailable(available);
        if (!available) setAnalysisConsent(false);
      })
      .catch(() => {
        if (active) {
          setLiveAnalysisAvailable(false);
          setAnalysisConsent(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const imageFiles = imagePreviews.map((preview) => preview.file);
  const uploadReady = imageFiles.length >= 3 && imageFiles.length <= 5;
  function transition(nextStage: StudioStage) {
    setStage(nextStage);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function chooseExhibit(selectedManifest: ExhibitManifest) {
    setManifest(selectedManifest);
    setConfirmedClaimIds(new Set());
    setPreservedClaimIds(new Set());
    setProvenanceNotice(undefined);
    transition("review");
  }

  function addImages(files: File[]) {
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const images = files.filter((file) => allowedTypes.has(file.type) && file.size <= 2 * 1024 * 1024);
    if (images.length === 0) {
      setUploadError("Choose JPG, PNG, or WebP photographs no larger than 2 MB each.");
      return;
    }
    const availableSlots = Math.max(0, 5 - imagePreviews.length);
    const additions = images.slice(0, availableSlots).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImagePreviews((current) => {
      const next = [...current, ...additions];
      imagePreviewsRef.current = next;
      return next;
    });
    const nextCount = imagePreviews.length + additions.length;
    setUploadError(nextCount < 3 ? "Add at least three photos to map a place." : undefined);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    addImages(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addImages(Array.from(event.dataTransfer.files));
  }

  async function mapArchive() {
    if (!uploadReady) {
      setUploadError("Add three to five photos before mapping this story.");
      return;
    }

    setIsMapping(true);
    setUploadError(undefined);

    try {
      if (analysisConsent && transcript.trim().length < 20) {
        throw new Error("Add at least 20 characters of transcript or story note so the live map has words to ground.");
      }
      const photos = analysisConsent
        ? await Promise.all(
            imageFiles.map(
              (file, index) =>
                new Promise<{ id: string; label: string; dataUrl: string }>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    typeof reader.result === "string"
                      ? resolve({ id: `upload-photo-${index + 1}`, label: file.name, dataUrl: reader.result })
                      : reject(new Error(`Could not read ${file.name}.`));
                  reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
                  reader.readAsDataURL(file);
                }),
            ),
          )
        : [];
      const requestBody = analysisConsent
        ? {
            live: true,
            title: storyTitle.trim() || "A family keepsake",
            dedication: dedication.trim() || undefined,
            transcript: transcript.trim(),
            hasOriginalAudio: Boolean(audioFile),
            photos,
          }
        : { live: false };
      const response = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = (await response.json()) as ApiEnvelope;
      if (!response.ok || !result.ok || !result.manifest || !result.mode) {
        throw new Error(result.error ?? "The source map could not be created.");
      }

      let nextManifest = result.manifest;
      if (result.mode === "live" && audioFile) {
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = URL.createObjectURL(audioFile);
        nextManifest = {
          ...nextManifest,
          sources: nextManifest.sources.map((source) =>
            source.id === "story-transcript"
              ? {
                  ...source,
                  kind: "audio" as const,
                  label: `${source.label} · full original recording`,
                  assetPath: audioUrlRef.current,
                  timeStartSeconds: undefined,
                  timeEndSeconds: undefined,
                }
              : source,
          ),
        };
      }
      setManifest(nextManifest);
      setConfirmedClaimIds(new Set());
      setPreservedClaimIds(new Set());
      setProvenanceNotice(
        result.mode === "live"
          ? "Live blueprint: with your consent, GPT-5.6 analyzed the selected photos and text for this request. Keepscape did not persist them. Audio stayed on this device. Confirm every uncertain detail before building."
          : `Demo fallback: ${result.reason ?? "live credentials were unavailable"}. Your selected files were not retained or represented as analyzed; this desk now shows a bundled source-grounded exhibit.`,
      );
      transition("review");
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : "The source map could not be created.");
    } finally {
      setIsMapping(false);
    }
  }

  async function buildExhibit() {
    const response = await fetch("/api/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest, live: true }),
    });
    const result = (await response.json()) as ApiEnvelope;
    if (!response.ok || !result.ok || !result.manifest || !result.mode) {
      throw new Error(result.error ?? "The exhibit workshop did not finish.");
    }
    setManifest(result.manifest);
    return { mode: result.mode, reason: result.reason, trace: result.trace ?? [] };
  }

  const headerLabel = useMemo(() => {
    if (stage === "choose") return "True-story studio";
    if (stage === "play") return manifest.title;
    return `Working on ${manifest.title}`;
  }, [manifest.title, stage]);

  if (stage === "play") {
    return <ExhibitPlayer manifest={manifest} onExit={() => transition("build")} />;
  }

  return (
    <div className="keepscape-shell">
      <header className="site-header">
        <button className="wordmark" type="button" onClick={() => transition("choose")} aria-label="Keepscape home">
          <span className="wordmark__seal" aria-hidden="true">K</span>
          <span>
            <strong>KEEPSCAPE</strong>
            <small>{headerLabel}</small>
          </span>
        </button>
        <div className="trust-line">
          <LockKeyhole size={14} aria-hidden="true" />
          Traceable story · generated space clearly labeled
        </div>
      </header>

      {stage === "choose" ? (
        <>
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero__folio" aria-hidden="true">
              <span>FAMILY ARCHIVE</span>
              <span>EST. WHEN YOU REMEMBER</span>
            </div>
            <div className="hero__title-block">
              <span className="eyebrow">A generated space. A traceable story.</span>
              <h1 id="hero-title">Walk into a true story.</h1>
            </div>
            <div className="hero__intro">
              <p>
                Keepscape turns three to five real family photos and original voice into a walkable memory
                space — without inventing the people who were there.
              </p>
              <button className="button button--ink" type="button" onClick={() => chooseExhibit(sampleExhibits[0])}>
                Enter Lantern Lane <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
            <HeroMemoryCorridor manifest={sampleExhibits[0]} />
          </section>

          <main className="archive-workspace" ref={workspaceRef}>
            <div className="workspace-heading">
              <div>
                <span className="eyebrow">Begin with something real</span>
                <h2>Choose a memory already mapped,<br />or stage your own sources.</h2>
              </div>
              <p>
                The built-in archives are complete judge paths. They work without an account, key, or upload.
              </p>
            </div>

            <div className="archive-grid">
              <div className="sample-archives">
                {sampleExhibits.slice(0, 2).map((sample, index) => (
                  <article className="story-card" key={sample.slug}>
                    <MiniatureScene manifest={sample} index={index} />
                    <div className="story-card__copy">
                      <span className="story-card__eyebrow">
                        {sample.scenes[0].spatial
                          ? "Fictional demo · AI-generated source photos · walkable space"
                          : `Fictional demo · AI-generated source photo · ${sample.scenes[0].interaction.kind}`}
                      </span>
                      <h3>{sample.title}</h3>
                      <p>{sample.subtitle}</p>
                      <small>{sample.dedication}</small>
                      <button className="story-card__open" type="button" onClick={() => chooseExhibit(sample)}>
                        Open source desk <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <section className="new-archive" aria-labelledby="new-archive-title">
                <div className="new-archive__heading">
                  <span className="ticket-number">NEW ARCHIVE</span>
                  <Sparkles size={20} aria-hidden="true" />
                  <h3 id="new-archive-title">Begin with your own</h3>
                  <p>Map three to five photos into a guided spatial story. Add original voice when you have it.</p>
                </div>

                <div className="upload-drop" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
                  <input
                    id="archive-images"
                    className="visually-hidden"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleImageChange}
                  />
                  <Upload size={21} aria-hidden="true" />
                  <p><strong>Drop photographs here</strong><span>or choose JPG, PNG, or WebP</span></p>
                  <label className="small-button" htmlFor="archive-images">Choose photos</label>
                </div>

                {imagePreviews.length > 0 && (
                  <div className="upload-previews" aria-label="Selected photographs">
                    {imagePreviews.map(({ file, url }, index) => (
                      <div className="upload-preview" key={`${file.name}-${file.lastModified}`}>
                        <span className="upload-preview__image" style={{ backgroundImage: `url(${url})` }} role="img" aria-label={file.name} />
                        <span>{file.name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => {
                            URL.revokeObjectURL(url);
                            setImagePreviews((previews) => {
                              const next = previews.filter((_, fileIndex) => fileIndex !== index);
                              imagePreviewsRef.current = next;
                              return next;
                            });
                          }}
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="archive-fields">
                  <label className="file-field">
                    <FileAudio size={17} aria-hidden="true" />
                    <span>{audioFile ? audioFile.name : "Add original audio (optional)"}</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(event) => setAudioFile(event.target.files?.[0])}
                    />
                  </label>
                  <label>
                    <span>Transcript or story note <small>recommended for live mapping</small></span>
                    <textarea
                      rows={3}
                      value={transcript}
                      onChange={(event) => setTranscript(event.target.value)}
                      placeholder="Paste the words as they were told. You will confirm any uncertain facts."
                    />
                  </label>
                  <label>
                    <span>Story title <small>used for a live exhibit</small></span>
                    <input
                      type="text"
                      value={storyTitle}
                      maxLength={70}
                      onChange={(event) => setStoryTitle(event.target.value)}
                      placeholder="The night the lanterns came home"
                    />
                  </label>
                  <label>
                    <span>Dedication <small>optional</small></span>
                    <input
                      type="text"
                      value={dedication}
                      maxLength={90}
                      onChange={(event) => setDedication(event.target.value)}
                      placeholder="For everyone who remembers the bell"
                    />
                  </label>
                </div>

                <div className="upload-privacy">
                  <LockKeyhole size={14} aria-hidden="true" />
                  {liveAnalysisAvailable
                    ? "Audio stays on this device. Live photo analysis is opt-in and is never persisted by Keepscape."
                    : liveAnalysisAvailable === false
                      ? "Public judge mode keeps selected media on this device and uses the labeled replay. Configure an OpenAI key locally for opt-in analysis."
                      : "Checking whether opt-in live analysis is available…"}
                </div>
                <label className="consent-field">
                  <input
                    type="checkbox"
                    checked={analysisConsent}
                    disabled={liveAnalysisAvailable !== true}
                    onChange={(event) => setAnalysisConsent(event.target.checked)}
                  />
                  <span>
                    {liveAnalysisAvailable
                      ? "Send selected photos and story text to OpenAI for this analysis; Keepscape does not persist them. Original audio stays on this device."
                      : "Live OpenAI analysis is unavailable on this public judge deployment."}
                  </span>
                </label>
                {analysisConsent && transcript.trim().length < 20 && (
                  <p className="field-hint">Live analysis needs at least 20 characters of transcript or story note.</p>
                )}
                {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
                <button
                  className="button button--accent button--wide"
                  type="button"
                  onClick={mapArchive}
                  disabled={isMapping || !uploadReady || (analysisConsent && transcript.trim().length < 20)}
                >
                  {isMapping
                    ? "Mapping what is known…"
                    : analysisConsent
                      ? `Analyze ${imageFiles.length || "your"} sources`
                      : "Use the labeled demo fallback"}
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </section>
            </div>
          </main>
        </>
      ) : (
        <main className="studio-workspace">
          <StageRail stage={stage} />
          {stage === "review" && (
            <SourceDesk
              manifest={manifest}
              provenanceNotice={provenanceNotice}
              confirmedClaimIds={confirmedClaimIds}
              preservedClaimIds={preservedClaimIds}
              onConfirmClaim={(claimId) => {
                setPreservedClaimIds((ids) => {
                  const next = new Set(ids);
                  next.delete(claimId);
                  return next;
                });
                setConfirmedClaimIds((ids) => new Set(ids).add(claimId));
              }}
              onPreserveClaim={(claimId) => {
                setConfirmedClaimIds((ids) => {
                  const next = new Set(ids);
                  next.delete(claimId);
                  return next;
                });
                setPreservedClaimIds((ids) => new Set(ids).add(claimId));
              }}
              onApprove={() => {
                setManifest((current) =>
                  recordSourceDeskReview(applyHumanConfirmations(current, confirmedClaimIds), preservedClaimIds),
                );
                transition("build");
              }}
              onBack={() => transition("choose")}
            />
          )}
          {stage === "build" && (
            <BuildTrail
              manifest={manifest}
              onBack={() => transition("review")}
              onBuild={buildExhibit}
              onLaunch={() => {
                setManifest(recordInteractionCopyReview(manifest));
                transition("play");
              }}
            />
          )}
        </main>
      )}

      <footer className="site-footer">
        <span>Keepscape · Every fact has a way home.</span>
        <span>Built with GPT-5.6 + Codex</span>
      </footer>
    </div>
  );
}
