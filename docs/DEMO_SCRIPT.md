# Keepscape v5 demo script

Measured release-candidate runtime: **1:27.954** at 1920×1080 and 25 fps. The spoken copy is canonical in
[`DEMO_NARRATION.md`](./DEMO_NARRATION.md).

## 0:00–0:12.133 — The transformation

**Visual:** Three clearly labeled fictional demo photographs arrive as physical prints around the line “Three
photos. One remembered story.” A persistent disclosure identifies the built-in photos as AI-generated and the
narration as synthetic. They
dissolve directly into the full-screen Lantern Lane portal. Drag the world, move deeper, and look left so this
reads as a place—not a slideshow.

**Silent beat:** **THREE PHOTOS. ONE REMEMBERED STORY.** / *Then the archive opens.*

**Purpose:** Show the product magic before explaining the architecture.

## 0:12.133–0:25.973 — Evidence Lens / Truth Thread

**Visual:** Select Painted and switch on Evidence Lens. Hold on the new **Truth Thread** as the world recedes and
the photo-region, audio-timecode, and exact human-decision chain resolves in one frame. End with a short reveal of
**Open full source archive**; the Truth Thread remains the hero, not the drawer.

**Silent beat:** **EVERY DETAIL HAS A WAY HOME.**

**Purpose:** Establish the differentiator: the generated world can always lead back to evidence.

## 0:25.973–0:37.345 — Human truth control

**Visual:** Start already framed on the single unsupported bicycle-ownership claim. Choose **Preserve
uncertainty**, then hold on **Kept uncertain**. Do not tour the rest of Source Desk in this cut.

**Silent beat:** **UNCERTAIN STAYS UNCERTAIN.**

**Purpose:** Make the human truth boundary emotionally and visually immediate.

## 0:37.345–0:52.437 — GPT-5.6, You, Codex

**Visual:** Hold briefly on the three GPT-5.6 / You / Codex cards, run the build, show **PUBLIC REPLAY**, then use
a readable close-up of the real **VERIFIED LIVE CODEX SDK RUN** receipt link. The final human gate remains below
as context; do not tour or scroll through it.

**Silent beat:** **THREE HANDS. CLEAR BOUNDARIES.**

**Purpose:** Explain who does what and prove the live Codex boundary without stalling the story.

## 0:52.437–1:02.289 — Lantern Lane payoff

**Visual:** Collect Painted, Tasseled, and Pale in quick succession. The last detail closes automatically; hold
on the full-world completion bloom and **3/3 · archive awakened**.

**Silent beat:** **THREE LIGHTS. THREE SOURCES.**

**Purpose:** Show a complete, playful interaction—not just a technical proof.

## 1:02.289–1:12.653 — Repair Bench montage

**Visual:** In a ten-second montage, ring too early and show the reset; then perform Turn → Loosen → Chain → Ring.
End on **4/4 · archive awakened**. Close only the intermediate detail cards; completion closes the final card.

**Silent beat:** **THE MEMORY SETS THE RULES.**

**Purpose:** Prove the runtime produces evidence-shaped mechanics rather than reskinned slideshows.

## 1:12.653–1:22.973 — Engineering evidence

**Visual:** Show one cinematic proof card for 62 tests, four browser journeys, the live Codex SDK receipt, and
zero judge credentials. Reveal the pinned GitHub JSON for no more than two seconds—never tour the repository.

**Silent beat:** **BUILT WITH CODEX. PROVED IN PUBLIC.**

**Purpose:** Give judges verifiable implementation evidence without turning the demo into a repository tour.

## 1:22.973–1:27.954 — Close

**Visual:** Clean title card: “Keepscape — Walk into a true story.” Secondary line: “AI can build the place. It
cannot rewrite the memory.” Keep the hosted app and repository URLs small but readable.

## Capture and upload checklist

- Capture every browser segment natively at 1920×1080 and 25 fps.
- Never freeze a short clip to fit narration by more than 0.35 seconds; re-record it instead.
- Use an ordinary arrow cursor with eased movement; hide it on opening and closing cards.
- Keep the Truth Thread, GPT-5.6, PUBLIC REPLAY, live Codex receipt, and both completion blooms legible.
- Include spoken narration. Upload the generated SRT as YouTube captions.
- Keep the original procedural ambient bed subtle beneath the narration; it should join cuts, not sound like stock music.
- The AI-assisted voiceover is permitted by the July 13 host announcement.
- Upload publicly to YouTube and verify video, audio, and captions while logged out.

## OpenAI narration generation

The release voice uses a single Marin voice across the OpenAI audio APIs: `gpt-audio-1.5` handles the two
Codex passages where exact brand articulation matters most, while the controllable Speech endpoint handles the
remaining scenes. Every take uses an intimate documentary direction, exact per-scene delivery notes, and fixed
120 ms / 180 ms leading and trailing room. The fixed padding prevents each API's natural clip
silence plus the renderer's 0.9-second visual tail from turning each chapter into a disconnected reading.

Keep the API key in the environment; never pass it as a command-line argument:

```bash
export OPENAI_API_KEY="..."
pnpm voice:openai -- --out /tmp/keepscape-demo/openai-hybrid-marin
```

Generate one segment again after an audition without paying to regenerate the rest:

```bash
pnpm voice:openai -- \
  --out /tmp/keepscape-demo/openai-hybrid-marin \
  --only 03 \
  --force
```

Then render against the externally generated exact transcripts:

```bash
DEMO_OUT=/tmp/keepscape-demo-v5-final \
DEMO_VOICE_DIR=/tmp/keepscape-demo/openai-hybrid-marin \
python3 scripts/render_demo.py
```

The narration is synthetic and must remain disclosed in the opening frame and YouTube metadata.
