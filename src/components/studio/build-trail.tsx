"use client";

import { useState } from "react";
import { ArrowRight, Check, Code2, FlaskConical, Sparkles, UserRoundCheck } from "lucide-react";

import type { ExhibitManifest } from "@/lib/exhibit-schema";

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
      detail: "Creates the story-specific typed interaction; the host then validates every allowed reference.",
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
          return (
            <article className={`pipeline-card${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`} key={name}>
              <div className="pipeline-card__top">
                <span className="pipeline-card__icon">
                  {isDone ? <Check size={18} strokeWidth={2.8} aria-hidden="true" /> : <Icon size={20} aria-hidden="true" />}
                </span>
                <span className="pipeline-card__status">
                  {isActive ? "working" : isDone ? "complete" : index === 1 ? "approved" : "waiting"}
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
          <span>{runState === "complete" ? (mode === "live" ? "LIVE RUN" : "VERIFIED REPLAY") : "READY"}</span>
        </div>

        {runState === "complete" ? (
          <div className="evidence-grid">
            <div>
              <span className="evidence-title">{mode === "live" ? "Agent workshop" : "Checked-in artifact receipt"}</span>
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
            {mode === "demo" && modeReason && <p className="replay-reason">Demo fallback: {modeReason}</p>}
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
                The public demo replays a real, bundled build so judges need no credentials. Local mode can run
                GPT-5.6 and Codex live.
              </p>
            )}
          </div>
        )}
      </div>

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
            Enter {manifest.title}
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
