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
import { applyHumanConfirmations } from "@/lib/human-review";

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

  const imageFiles = imagePreviews.map((preview) => preview.file);
  const uploadReady = imageFiles.length >= 3 && imageFiles.length <= 5;
  const jumpToWorkspace = () => workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

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
        throw new Error("Add at least 20 characters of transcript so the live story map has words to ground.");
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
                  timeStartSeconds: 0,
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
          : `Demo fallback: ${result.reason ?? "live credentials were unavailable"}. Your private files were not uploaded or represented as analyzed; this desk now shows a bundled source-grounded exhibit.`,
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
          Source-grounded · no cloned voices or likenesses
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
              <span className="eyebrow">Photos hold the scene. A voice holds the way back.</span>
              <h1 id="hero-title">Walk into a true story.</h1>
            </div>
            <div className="hero__intro">
              <p>
                Keepscape turns real family source material into a small place you can explore — without
                inventing the people who were there.
              </p>
              <button className="button button--ink" type="button" onClick={jumpToWorkspace}>
                Open the memory desk <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="hero__recipe" aria-label="Keepscape recipe">
              <span>03–05</span><p>photographs</p>
              <i aria-hidden="true">+</i>
              <span>01</span><p>spoken story</p>
              <i aria-hidden="true">→</i>
              <span>∞</span><p>ways back in</p>
            </div>
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
                      <span className="story-card__eyebrow">Playable archive · {sample.scenes[0].interaction.kind}</span>
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
                  <p>Stage three to five photos. Add an original recording and transcript when you have them.</p>
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
                  Audio stays on this device. Live photo analysis is opt-in and is never persisted by Keepscape.
                </div>
                <label className="consent-field">
                  <input
                    type="checkbox"
                    checked={analysisConsent}
                    onChange={(event) => setAnalysisConsent(event.target.checked)}
                  />
                  <span>
                    Send selected photos and transcript to OpenAI for this analysis; Keepscape does not persist them.
                  </span>
                </label>
                {analysisConsent && transcript.trim().length < 20 && (
                  <p className="field-hint">Live analysis needs at least 20 characters of transcript.</p>
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
                setManifest((current) => applyHumanConfirmations(current, confirmedClaimIds));
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
              onLaunch={() => transition("play")}
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
