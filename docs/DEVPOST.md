# Devpost submission draft

## Title

Keepscape

## Tagline

Walk into a true story.

## Category

Apps for Your Life

## One-line description

Keepscape uses GPT-5.6 and Codex to turn photos plus a spoken or written memory into an explorable spatial story,
with a Truth Thread from every factual detail to its source.

## Inspiration

The most meaningful stories in a family often end up split across camera rolls, voice notes, and the memory of
one person who knows why an ordinary object mattered. Existing tools can store those files or generate a pretty
slideshow, but storage is not the same as understanding—and generation can quietly invent details.

We wanted to ask a more ambitious question: can AI help a family *enter* a true story without replacing the
person who told it?

## What it does

Keepscape accepts three to five photos, story text, and an optional original recording. GPT-5.6 maps claims
to the supplied material, separates supported facts from uncertainty, and creates a
strict source-linked story blueprint containing claims, hotspots, and narrative copy—not spatial geometry or
shared cross-photo anchors. The host first compiles the three to five photo sources into a safe diorama. The
storyteller must then confirm or deliberately preserve every uncertain claim and review every displayed claim
and GPT-authored story field. A text-only note never masquerades as audio or receives a fabricated timecode.
The host converts the reviewed mechanic and spatial sources into opaque tokens. Codex returns only the approved
mechanic kind/token set plus a bounded spatial plan—no story prose—then the host rebinds and validates those
structures without pretending to judge historical truth. The final mechanic, target set or order, preserved
prompt, and completion/retry copy are shown for human approval before entry.

One story becomes a three-photo night-market corridor that visitors can move through and explore. Another
becomes a hands-on repair ritual where the order itself carries meaning. The result is not a reskinned
slideshow: the spatial arrangement and interaction change with the story.

The signature **Evidence Lens** makes the full-screen memory corridor recede while a cinematic **Truth Thread**
keeps the selected source legible. In one frame it resolves the exact photo crop, audio range, human decision,
and the boundary between evidence and spatial interpretation. The complete source archive remains one click
away. The space is plainly labeled as a generated spatial interpretation—not a scan or reconstruction.
Keepscape never clones a voice, recreates a person, or presents model confidence as history.

## How we built it

- **GPT-5.6** uses Structured Outputs to produce a strict source-linked blueprint with claims, uncertainty,
  hotspots, source references, and narrative copy. It does not author diorama geometry.
- The **host compiler** turns three to five existing photo source IDs into an allowlisted diorama with canonical
  plane slots. Presentation coordinates are labeled generated and never treated as source evidence.
- A **human grounding desk** blocks build until every uncertain claim is confirmed or preserved and every
  displayed claim and GPT-authored story field is reviewed against the sources.
- A **final-build language gate** shows the final mechanic, targets or order, prompt, and completion/retry wording;
  entering records explicit human approval as provenance.
- The **Codex SDK** receives a prose-free graph of opaque `hotspot-*` and `photo-*` tokens—never visitor text,
  media, labels, claims, excerpts, asset paths, or original IDs. It runs read-only/no-network with an ephemeral
  home and sanitized environment. A dynamic schema allows only the reviewed mechanic kind, exact token enums,
  an allowlisted preset, and booleans; there is no free-text output field.
- The **host gate** rejects mechanic changes, sequence reordering, and missing/extra/duplicate/unknown tokens;
  requires the exact existing spatial photo set; rebinds original IDs; preserves reviewed interaction copy;
  applies canonical plane slots; and requires a final Zod-valid manifest. These are structural guarantees, not
  a semantic truth verdict.
- A responsive **Next.js + React** runtime renders the validated package without evaluating arbitrary generated
  JavaScript, CSS, transforms, or shaders; the spatial presets are host-authored CSS.
- Two credential-free exhibits use clearly labeled AI-generated fictional photos and synthetic narration to
  provide a multi-photo CSS-3D memory corridor, a second sequence mechanic, Evidence Lens, source drawers,
  build receipts, keyboard controls, and reduced-motion support. The public judge experience is a verified
  replay with a visible fallback trace, not a disguised live model call.

Codex also accelerated the entire engineering workflow. Parallel agents researched idea collisions, built the
GPT pipeline, authored two mechanics, designed the product UI, generated tests, and repaired browser-QA
failures. We kept a decision log so judges can distinguish Codex's contribution from the product decisions we
made.

## Challenges we ran into

Our hardest challenge was not generating a beautiful scene. It was preventing beauty from outrunning truth.
A normal generative pipeline wants to fill narrative gaps. Keepscape instead treats every claim as a typed
reference graph and fails validation if an exhibit object loses its source.

We also rejected an earlier workflow-automation concept after competitor research showed substantial overlap
with existing replay and app-generation products. That reset cost time, but it led to a product whose central
experience is much more specific to GPT-5.6 and Codex.

## Accomplishments that we're proud of

- A multi-photo walkable memory space and a second, visibly different mechanic from one evidence contract.
- Evidence Lens makes the generated world recede while its Truth Thread resolves the exact source crop, audio
  range, human decision, and interpretation boundary in the same cinematic frame.
- Source provenance remains available inside the emotional experience instead of living in a separate report.
- The complete experience works without judge credentials while live GPT-5.6 and Codex modes remain real and
  inspectable.
- Generated interpretation, uncertain memory, and supported fact are distinct product states.
- The exhibit is usable with keyboard, touch, and reduced motion.

## What we learned

The safest way to use a coding agent creatively is not to ask it for unlimited code and hope for the best. A
small typed interaction language, strong evidence invariants, and visible build receipts let Codex be genuinely
inventive while keeping the result portable and testable.

We also learned that provenance does not need to feel like compliance. A cited photo view, a reviewed region,
or a few seconds of the original voice can be the most emotionally powerful part of the experience.

## What's next

We would add private, encrypted family spaces; collaborative fact confirmation; more interaction primitives;
and exportable offline exhibits that families can keep independently of the service. Museums and oral-history
projects could use the same grounding contract for community collections.

## Built with

GPT-5.6, OpenAI Responses API, Codex SDK, Next.js, React, TypeScript, Zod, CSS 3D, Motion, Vitest, Playwright
