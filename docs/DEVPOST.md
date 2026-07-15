# Devpost submission draft

## Title

Keepscape

## Tagline

Walk into a true story.

## Category

Apps for Your Life

## One-line description

Keepscape uses GPT-5.6 and Codex to turn real photos and original voice into a bespoke, playable memory exhibit
where every factual detail links back to its source.

## Inspiration

The most meaningful stories in a family often end up split across camera rolls, voice notes, and the memory of
one person who knows why an ordinary object mattered. Existing tools can store those files or generate a pretty
slideshow, but storage is not the same as understanding—and generation can quietly invent details.

We wanted to ask a more ambitious question: can AI help a family *enter* a true story without replacing the
person who told it?

## What it does

Keepscape accepts three to five photos, a transcript, and an optional original recording. GPT-5.6 maps claims
to supplied photo and transcript evidence, separates supported facts from uncertainty, and creates a
source-linked story blueprint. The storyteller confirms or deliberately preserves what the sources cannot
establish. Codex then creates a small typed interaction shaped around that memory, and the host validates it.

One story might become a lantern trail where visitors collect the objects named in a night-market memory.
Another might become a hands-on repair ritual where the order itself carries meaning. The result is not a
reskinned slideshow: the interaction changes with the story.

Every factual object opens a source card. The bundled judge archives include exact photo regions and narration
timecodes; explicit human confirmations become new provenance sources. Generated scenery is labeled as
interpretation. Keepscape never clones a voice, recreates a person, or presents model confidence as history.

## How we built it

- **GPT-5.6** produces a typed story blueprint with claims, uncertainty, source links, moments, and interaction
  affordances using structured output.
- A **human grounding desk** makes uncertainty reviewable before generation.
- The **Codex SDK** converts an approved blueprint into a typed interaction spec inside an isolated, no-network
  workspace. The host then runs schema, reference-integrity, and hotspot-allowlist checks.
- A responsive **Next.js + React** runtime renders the validated package without evaluating arbitrary generated
  JavaScript.
- Two credential-free exhibits provide a deterministic judge path with different mechanics, source drawers,
  build receipts, keyboard controls, and reduced-motion support.

Codex also accelerated the entire engineering workflow. Parallel agents researched idea collisions, built the
GPT pipeline, authored two mechanics, designed the product UI, generated tests, and repaired browser-QA failures. We kept a
decision log so judges can distinguish Codex's contribution from the product decisions we made.

## Challenges we ran into

Our hardest challenge was not generating a beautiful scene. It was preventing beauty from outrunning truth.
A normal generative pipeline wants to fill narrative gaps. Keepscape instead treats every claim as a typed
reference graph and fails validation if an exhibit object loses its source.

We also rejected an earlier workflow-automation concept after competitor research showed substantial overlap
with existing replay and app-generation products. That reset cost time, but it led to a product whose central
experience is much more specific to GPT-5.6 and Codex.

## Accomplishments that we're proud of

- Two visibly different playable mechanics generated from one evidence contract.
- Source provenance remains available inside the emotional experience instead of living in a separate report.
- The complete experience works without judge credentials while live GPT-5.6 and Codex modes remain real and
  inspectable.
- Generated interpretation, uncertain memory, and supported fact are distinct product states.
- The exhibit is usable with keyboard, touch, and reduced motion.

## What we learned

The safest way to use a coding agent creatively is not to ask it for unlimited code and hope for the best. A
small typed interaction language, strong evidence invariants, and visible build receipts let Codex be genuinely
inventive while keeping the result portable and testable.

We also learned that provenance does not need to feel like compliance. A photo crop or a few seconds of the
original voice can be the most emotionally powerful part of the experience.

## What's next

We would add private, encrypted family spaces; collaborative fact confirmation; more interaction primitives;
and exportable offline exhibits that families can keep independently of the service. Museums and oral-history
projects could use the same grounding contract for community collections.

## Built with

GPT-5.6, OpenAI Responses API, Codex SDK, Next.js, React, TypeScript, Zod, Motion, Vitest, Playwright
