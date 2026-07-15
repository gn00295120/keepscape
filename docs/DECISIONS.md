# Product decision record

This log records the consequential human/agent decisions behind the Build Week project. It exists both to
keep the implementation coherent and to make the role of Codex inspectable to judges.

## D-001 — Optimize for evidence, not AI narration

**Status:** accepted
**Date:** 2026-07-15

LLM confidence and prose are not product proof. Important findings must resolve to inspectable artifacts:
commands, exit codes, diffs, source references, screenshots, or reproducible behavioral checks. The UI will
make evidence primary and model narration secondary.

## D-002 — Use a deterministic judge path

**Status:** accepted
**Date:** 2026-07-15

The deployed app must have a complete built-in case that works without a judge supplying credentials. Live
GPT-5.6 and Codex execution remain a first-class mode, but a transient API or agent failure must not make the
product impossible to evaluate.

## D-003 — Reject generic semantic mutation testing as the headline

**Status:** rejected direction
**Date:** 2026-07-15

The first concept compiled PR intent into semantic mutations that Codex tried to keep alive under the existing
test suite. Research found material overlap with Meta's Just-in-Time Catching Test Generation, the 2026
Intent-Based Mutation Testing paper, Tautest, and commercial mutation platforms. The mechanism may survive as
one verification technique, but it cannot carry the originality claim.

Sources:

- <https://engineering.fb.com/2026/02/11/developer-tools/the-death-of-traditional-testing-agentic-development-jit-testing-revival/>
- <https://arxiv.org/abs/2601.22832>
- <https://arxiv.org/abs/2607.05149>
- <https://github.com/canblmz1/tautest>

## D-004 — Select Counterexample Coach for the Education track

**Status:** superseded
**Date:** 2026-07-15

An 11-concept tournament compared novelty, demo impact, technical depth, real-world impact, and six-day
feasibility. Counterexample Coach ranked first. The learner submits an answer plus reasoning; GPT-5.6 infers
the smallest hidden assumption that explains the error; Codex builds and validates an interactive experiment
that falsifies that assumption. The learner must predict before the reveal and then revise the explanation.

This is not a chat-first tutor and does not generate a longer explanation of the correct answer. Its product
unit is a personalized, executable counterexample designed to create cognitive conflict safely.

The closest broad products—Khanmigo, Synthesis Tutor, and general coding tutors—provide adaptive dialogue and
feedback. The differentiation to preserve is the full `reasoning → inferred misconception → prediction →
executable counterexample → reflection` loop.

## D-005 — Keep the public name provisional until visual validation

**Status:** superseded
**Date:** 2026-07-15

`Counterexample Coach` is the descriptive working title. Naming is not allowed to block implementation, but
the Devpost title will be selected only after the core interaction has been rendered and tested with people.

## D-006 — Re-run selection from the organizer's announcement backward

**Status:** accepted
**Date:** 2026-07-15

The project is not constrained by the team's past domains. Candidate ideas are judged from the OpenAI Build
Week winner announcement backward: a ten-second transformation, indispensable and visible GPT-5.6 plus Codex
usage, a positive mass-market story, a complete product experience, and credible impact. Education and agent
security were rejected because their strongest concepts were either less promotable or too niche. A
demonstration-to-software workflow compiler was rejected after finding direct overlap with Codex Record &
Replay, Codex Sites, SkillForge, Replay.build, UiPath, Tango, and a March 2026 Devpost project named TeachOnce.

## D-007 — Build source-grounded playable memory exhibits

**Status:** accepted
**Date:** 2026-07-15

Keepscape turns three to five photos and an original spoken story into a bespoke 2D/2.5D exhibit. GPT-5.6
extracts a strict source-linked story blueprint; the host compiles the photo sources into a safe diorama; the
human confirms or preserves uncertain facts and reviews generated wording; Codex returns a typed interaction
and bounded photo-order plan; and the host validates allowlists, references, canonical slots, and schema. The
product promise is not photo-to-3D and not an AI resurrection. Its differentiated unit is a playable true story
where every factual detail can be traced to an inspectable source or a human confirmation; the manually
calibrated judge fixtures additionally demonstrate reviewed photo regions and narration timecodes.

The deterministic judge path will ship two exhibits with materially different mechanics. This is the proof
that Keepscape generates story-specific software rather than reskinning a slideshow template.

## D-008 — Make the flagship archive a walkable spatial interpretation

**Status:** accepted
**Date:** 2026-07-15

The stronger organizer-facing transformation is not “photos become a game,” but “photos become a place you can
enter.” Lantern Lane therefore uses three consistent photo views as source planes in a bounded CSS-3D memory
corridor. The feature is deliberately called a generated spatial interpretation—not reconstruction,
photogrammetry, NeRF, or recovered geometry.

The signature interaction is Evidence Lens: generated scenery recedes while the selected item's cited source
view remains legible. When human-reviewed region metadata exists, as in the manually calibrated judge fixture,
the lens outlines that cited region; otherwise it stops at the cited view without implying object-level
precision. This makes the product's truth boundary part of the emotional reveal instead of a compliance screen.
The manifest only selects allowlisted presets and photo order; the host assigns canonical plane slots, and the
browser never accepts model-authored transforms or executable rendering code. Repair Bench remains a flat
sequence exhibit to prove graceful fallback and story-specific mechanics.

## D-009 — Separate semantic authorship from spatial compilation

**Status:** accepted
**Date:** 2026-07-15

GPT-5.6 owns the strict source-linked blueprint: claims, hotspots, source references, and narrative copy. It does
not emit spatial geometry or shared cross-photo anchors. The host first compiles three to five photo source IDs
into a safe diorama, then the human gate resolves all uncertainty and reviews the generated language.

Live Codex owns two bounded choices after approval: a typed interaction over existing hotspot IDs and a spatial
plan containing an allowlisted preset plus the existing photo source IDs in display order. The host requires the
exact source set, recreates canonical slots, rebinds references, and validates the final schema. A post-Codex
human gate shows the final mechanic, target set or required order, and all interaction-state wording before
entry. Those checks prove structural integrity; only a person can decide whether generated wording and any
sequence meaning are faithful to the memory. The public credential-free demo is a verified replay and must
never be described as a live model run.

Live Codex also receives an ephemeral home and a minimal environment with shell inheritance disabled. The host
does not trust model-authored receipt prose, does not write post-turn files into the agent-writable workspace,
and removes both temporary roots after the run. This keeps global Codex sessions, config, MCP servers, and
unrelated host secrets outside the product boundary.
