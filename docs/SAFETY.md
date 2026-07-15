# Safety and provenance model

Keepscape handles emotionally sensitive, potentially private source material. The following boundaries are
product requirements, not future polish.

## Truth states

Every factual claim has exactly one state:

- **Source-backed** — linked to at least one supplied photo or transcript source. Bundled fixtures additionally
  demonstrate precise regions and narration ranges.
- **Human-confirmed** — the storyteller explicitly supplied or confirmed it.
- **Uncertain** — plausible but unverified; it cannot be presented as exhibit fact.

Generated scene-setting is a separate **interpretation** layer. It can shape color, layout, transitions, and
game mechanics, but it cannot silently become a factual claim.

The manifest schema checks all claim, source, hotspot, and interaction references. A missing reference fails the
build rather than degrading to uncited prose.

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

1. The approved blueprint is treated as untrusted data, not executable instruction.
2. Codex receives an isolated workspace, `workspace-write` sandbox, no network, and no approval escalation.
3. The agent targets a typed interaction language instead of arbitrary browser JavaScript.
4. Its final output must satisfy the JSON schema and all referential-integrity checks.
5. The browser renders only validated values; it never evaluates generated source with `eval` or `Function`.

## Data handling

- OpenAI credentials stay on the server.
- Deterministic demo archives are fictional and contain no private media.
- Browser previews use local object URLs and should be revoked when replaced or closed.
- The app does not intentionally persist live uploads.
- A production version must add encrypted storage, explicit retention settings, deletion controls, and a clear
  consent flow before accepting shared family archives.
