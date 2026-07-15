"use client";

import { useState } from "react";
import { ArrowRight, Check, Code2, FlaskConical, Sparkles, UserRoundCheck } from "lucide-react";

import type { ExhibitManifest } from "@/lib/exhibit-schema";

const LIVE_CODEX_RECEIPT_URL =
  "https://github.com/gn00295120/keepscape/blob/f03dc22/docs/evidence/codex-live-run.json";

type BuildResult = {
  mode: "demo" | "live";
  reason?: string;
  trace: Array<{
    agent: "GPT-5.6" | "Codex" | "Truth gate" | "Typed runtime";
    action: string;
    status: "passed" | "demo" | "fallback";
  }>;
};

type BuildTrailProps = {
  manifest: ExhibitManifest;
  onBack: () => void;
  onBuild: () => Promise<BuildResult>;
  onLaunch: () => void;
};

type RunState = "ready" | "running" | "complete" | "failed";

const pause = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function BuildTrail({ manifest, onBack, onBuild, onLaunch }: BuildTrailProps) {
  const [runState, setRunState] = useState<RunState>("ready");
  const [activeStep, setActiveStep] = useState(0);
  const [mode, setMode] = useState<BuildResult["mode"]>("demo");
  const [modeReason, setModeReason] = useState<string>();
  const [runTrace, setRunTrace] = useState<BuildResult["trace"]>([]);
  const [error, setError] = useState<string>();
  const finalInteraction = manifest.scenes[0]?.interaction;
  const finalTargetIds = finalInteraction
    ? finalInteraction.kind === "collect"
      ? finalInteraction.targetHotspotIds
      : finalInteraction.stepHotspotIds
    : [];
  const hotspotById = new Map(manifest.scenes[0]?.hotspots.map((hotspot) => [hotspot.id, hotspot]) ?? []);

  async function runBuild() {
    setRunState("running");
    setActiveStep(0);
    setError(undefined);

    try {
      await pause(420);
      setActiveStep(1);
      await pause(420);
      setActiveStep(2);
      const result = await onBuild();
      setMode(result.mode);
      setModeReason(result.reason);
      setRunTrace(result.trace);
      await pause(520);
      setActiveStep(3);
      setRunState("complete");
    } catch (caught) {
      setRunState("failed");
      setError(caught instanceof Error ? caught.message : "The exhibit build could not be completed.");
    }
  }

  const pipelineSteps = [
    {
      name: "GPT-5.6",
      role: "Story cartographer",
      detail: "Finds people, objects, places, and quotes — each attached to its original source.",
      Icon: Sparkles,
    },
    {
      name: "You",
      role: "Keeper of the memory",
      detail: "Confirms the details a model cannot know and keeps interpretation visibly labeled.",
      Icon: UserRoundCheck,
    },
    {
      name: "Codex",
      role: "Exhibit workshop",
      detail: manifest.scenes.some((scene) => scene.spatial)
        ? "Compiles the reviewed mechanic from opaque tokens and chooses a bounded spatial preset/order; the host rebinds and validates every reference."
        : "Compiles the reviewed mechanic through a prose-free token contract; the host rebinds and validates every reference.",
      Icon: Code2,
    },
  ];

  return (
    <section className="studio-view build-trail" aria-labelledby="build-trail-title">
      <div className="view-heading view-heading--compact">
        <div>
          <span className="eyebrow">The build trail · every hand visible</span>
          <h1 id="build-trail-title">A memory becomes a place.</h1>
        </div>
        <p>
          This is not one model inventing a world in a black box. Each part has a job, a boundary, and evidence
          you can inspect.
        </p>
      </div>

      <div className="pipeline" data-run-state={runState} aria-label="Exhibit build pipeline">
        {pipelineSteps.map(({ name, role, detail, Icon }, index) => {
          const isActive = runState === "running" && activeStep === index;
          const isDone = runState === "complete" || activeStep > index;
          const isBundledReplay = runState === "complete" && mode === "demo" && index !== 1;
          return (
            <article className={`pipeline-card${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`} key={name}>
              <div className="pipeline-card__top">
                <span className="pipeline-card__icon">
                  {isDone ? <Check size={18} strokeWidth={2.8} aria-hidden="true" /> : <Icon size={20} aria-hidden="true" />}
                </span>
                <span className="pipeline-card__status">
                  {isActive
                    ? "working"
                    : isBundledReplay
                      ? "verified replay"
                      : isDone
                        ? "complete"
                        : index === 1
                          ? "approved"
                          : "waiting"}
                </span>
              </div>
              <span className="pipeline-card__index">0{index + 1}</span>
              <h2>{name}</h2>
              <h3>{role}</h3>
              <p>{detail}</p>
            </article>
          );
        })}
      </div>

      <div className="build-console" aria-live="polite">
        <div className="build-console__head">
          <div>
            <span className="console-light" aria-hidden="true" />
            Build evidence
          </div>
          <span>{runState === "complete" ? (mode === "live" ? "LIVE RUN" : "PUBLIC REPLAY") : "READY"}</span>
        </div>

        {runState === "complete" ? (
          <div className="evidence-grid">
            <div>
              <span className="evidence-title">{mode === "live" ? "Agent workshop" : "Verified replay evidence"}</span>
              <ul>
                {manifest.buildEvidence.agents.map((agent) => (
                  <li key={agent.name}>
                    <Check size={13} aria-hidden="true" />
                    <span>
                      <strong>{agent.name}</strong> — {agent.result}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className="evidence-title">Actual run trace + release checks</span>
              <ul>
                {runTrace.map((entry) => (
                  <li key={`${entry.agent}-${entry.action}`}>
                    <Check size={13} aria-hidden="true" />
                    <span>
                      <strong>{entry.agent} · {entry.status}</strong> — {entry.action}
                    </span>
                  </li>
                ))}
                {manifest.buildEvidence.tests.map((test) => (
                  <li key={test.name}>
                    <FlaskConical size={13} aria-hidden="true" />
                    <span>
                      <strong>{test.name}</strong> — {test.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="evidence-summary">
              <span>{manifest.buildEvidence.generatedFiles.length}</span>
              <p>typed artifact references in this receipt</p>
              <small>{manifest.buildEvidence.model}</small>
            </div>
            {mode === "demo" ? (
              <a className="live-proof" href={LIVE_CODEX_RECEIPT_URL} target="_blank" rel="noreferrer">
                <Check size={18} aria-hidden="true" />
                <span>
                  <strong>Verified live Codex SDK run</strong>
                  <small>Opaque input · enum-only result · host validation passed</small>
                </span>
                <ArrowRight size={17} aria-hidden="true" />
              </a>
            ) : null}
            {mode === "demo" && modeReason ? (
              <p className="replay-reason">
                Judge mode uses the bundled, validated result so no credentials are required. The live SDK
                receipt above records the separate production-boundary verification.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="console-ready">
            {runState === "running" ? (
              <>
                <span className="console-spinner" aria-hidden="true" />
                <p>{pipelineSteps[Math.min(activeStep, 2)].name} is {pipelineSteps[Math.min(activeStep, 2)].role.toLowerCase()}…</p>
              </>
            ) : runState === "failed" ? (
              <p className="console-error">{error}</p>
            ) : (
              <p>
                The public judge path replays a validated build so no credentials are required. GPT-5.6 and
                Codex also run live, with a redacted SDK receipt linked after build.
              </p>
            )}
          </div>
        )}
      </div>

      {runState === "complete" && finalInteraction ? (
        <section className="final-copy-review" aria-labelledby="final-copy-review-title">
          <div>
            <span className="ticket-number">Final build human gate</span>
            <h2 id="final-copy-review-title">Approve the final interaction language.</h2>
            <p>
              When Codex runs it sees only opaque tokens and cannot author this copy. In every mode, the host
              preserves the source-desk language; this gate confirms the final mechanic, order, and wording.
            </p>
          </div>
          <dl>
            <div>
              <dt>Mechanic</dt>
              <dd>{finalInteraction.kind === "collect" ? "Collection · independent targets" : "Sequence · required source order"}</dd>
            </div>
            <div>
              <dt>{finalInteraction.kind === "collect" ? "Targets" : "Required order"}</dt>
              <dd>
                <ol className="final-copy-review__targets">
                  {finalTargetIds.map((hotspotId) => (
                    <li key={hotspotId}>{hotspotById.get(hotspotId)?.title ?? hotspotId}</li>
                  ))}
                </ol>
              </dd>
            </div>
            <div>
              <dt>Prompt</dt>
              <dd>{finalInteraction.prompt}</dd>
            </div>
            <div>
              <dt>{finalInteraction.kind === "collect" ? "Completion" : "Success"}</dt>
              <dd>
                {finalInteraction.kind === "collect"
                  ? finalInteraction.completionMessage
                  : finalInteraction.successMessage}
              </dd>
            </div>
            {finalInteraction.kind === "sequence" ? (
              <div>
                <dt>Retry</dt>
                <dd>{finalInteraction.retryMessage}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <div className="view-actions build-actions">
        <button className="button button--quiet" type="button" onClick={onBack} disabled={runState === "running"}>
          Return to sources
        </button>
        {runState !== "complete" ? (
          <button className="button button--accent" type="button" onClick={runBuild} disabled={runState === "running"}>
            {runState === "running" ? "Building the exhibit…" : runState === "failed" ? "Try the build again" : "Build this true story"}
            <Sparkles size={17} aria-hidden="true" />
          </button>
        ) : (
          <button className="button button--accent button--launch" type="button" onClick={onLaunch}>
            Approve final interaction &amp; enter {manifest.title}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
