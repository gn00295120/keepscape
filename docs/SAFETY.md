# Safety and provenance model

Keepscape handles emotionally sensitive, potentially private source material. The following boundaries are
product requirements, not future polish.

## Truth states

Every factual claim has exactly one state:

- **Source-backed** — linked to at least one supplied photo region or original-recording timecode. The manually
  calibrated bundled fixtures demonstrate reviewed regions and narration ranges.
- **Human-confirmed** — the storyteller explicitly confirmed it at the source desk.
- **Uncertain** — plausible but unverified; it cannot be presented as exhibit fact.

A text-only story note is visibly typed as a human note, never relabeled as audio or given a fabricated 00:00
timecode. Claims that rely on it remain uncertain until the storyteller confirms them or deliberately preserves
their uncertainty.

Generated scene-setting is a separate **interpretation** layer. It can shape color, layout, depth, lighting,
transitions, and game mechanics, but it cannot silently become a factual claim.

## Spatial interpretation boundary

Keepscape's walkable space is not a scan, photogrammetry result, NeRF, digital twin, or recovered geometry.
Photos can establish that an object was visible; they do not establish its exact depth or placement in the
generated diorama. Every spatial scene therefore carries a permanent interpretation label. **Evidence Lens**
visually separates the selected cited source view from generated surroundings. If a human-reviewed normalized
region is present, it can outline that region in the original photo; otherwise it labels only the cited source
view. A bounded host preset—not model-authored CSS, shaders, transforms, or arbitrary geometry—controls camera
movement and plane placement.

The manifest schema checks all claim, source, hotspot, and interaction references. A missing reference fails the
build rather than degrading to uncited prose. These checks prove structural integrity, not whether a sentence is
historically true. Before build, a person must resolve every uncertain claim and approve every displayed
claim and all GPT-authored exhibit, scene, hotspot, and interaction-draft copy against the listed sources. After
Codex compiles the interaction, its final prompt and completion/retry wording is displayed for human approval
before entry.

## Personhood boundaries

Keepscape does not:

- clone or imitate a person's voice;
- animate a photograph as if the person were speaking;
- create a chatbot that claims to be a real or deceased person;
- infer sensitive relationships, diagnoses, or private events from appearance;
- describe an interpretation as recovered memory.

## Generated-code boundary

Live Codex generation is disabled unless `KEEPSCAPE_ENABLE_CODEX=1`.

When enabled:

1. GPT-5.6's strict source-linked blueprint is treated as untrusted data, not executable instruction. It contains
   claims, hotspots, source references, and narrative copy—not spatial geometry or shared cross-photo anchors.
2. Codex receives an isolated workspace, `workspace-write` sandbox, no network, and no approval escalation. Each
   run also gets an ephemeral `CODEX_HOME`, a minimal subprocess environment, no global MCP/config state, and a
   shell policy that inherits no environment variables.
3. Before Codex runs, the host compiles three to five existing photo source IDs into a safe diorama with
   canonical plane slots.
4. Codex returns a typed interaction and a minimal spatial plan: `enabled`, an allowlisted `preset`, and
   `orderedPhotoSourceIds`. It cannot return CSS, transforms, shaders, or coordinates.
5. The host requires known hotspot IDs and exactly the existing spatial photo-source set, applies canonical
   slots, rebinds plane references, and runs final schema and referential-integrity validation.
6. The browser renders the resulting typed values with host-authored CSS presets; it never evaluates generated
   source with `eval` or `Function`.
7. After the turn, validated output stays in memory; the host performs no fixed-name writes inside the
   agent-writable workspace. Both the workspace and isolated Codex home are deleted in `finally`.

## Data handling

- OpenAI credentials stay on the server.
- Deterministic demo archives use AI-generated fictional photos and synthetic narration. They are not family
  scans, recovered geometry, or reconstructions of a real place.
- Browser previews use local object URLs and should be revoked when replaced or closed.
- Optional original audio remains in the browser; live GPT analysis receives the photos and supplied story text,
  not the audio file.
- The app does not intentionally persist live uploads.
- A production version must add encrypted storage, explicit retention settings, deletion controls, and a clear
  consent flow before accepting shared family archives.
