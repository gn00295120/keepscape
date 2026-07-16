# Keepscape final demo script

Measured release-candidate runtime: **1:29.261** at 1920×1080 and 25 fps. The spoken copy is canonical in
[`DEMO_NARRATION.md`](./DEMO_NARRATION.md).

## 0:00–0:12.880 — The transformation

**Visual:** Three clearly labeled fictional demo photographs arrive as physical prints around the line “Three
photos. One remembered story.” A persistent disclosure identifies the built-in photos as AI-generated and the
narration as synthetic. They
dissolve directly into the full-screen Lantern Lane portal. Drag the world, move deeper, and look left so this
reads as a place—not a slideshow.

**Silent beat:** **THREE PHOTOS. ONE REMEMBERED STORY.** / *Then the archive opens.*

**Purpose:** Show the product magic before explaining the architecture.

## 0:12.880–0:26.720 — Evidence Lens / Truth Thread

**Visual:** Select Painted and switch on Evidence Lens. Hold on the new **Truth Thread** as the world recedes and
the photo-region, audio-timecode, and exact human-decision chain resolves in one frame. End with a short reveal of
**Open full source archive**; the Truth Thread remains the hero, not the drawer.

**Silent beat:** **EVERY DETAIL HAS A WAY HOME.**

**Purpose:** Establish the differentiator: the generated world can always lead back to evidence.

## 0:26.720–0:37.600 — Human truth control

**Visual:** Start already framed on the single unsupported bicycle-ownership claim. Choose **Preserve
uncertainty**, then hold on **Kept uncertain**. Do not tour the rest of Source Desk in this cut.

**Silent beat:** **UNCERTAIN STAYS UNCERTAIN.**

**Purpose:** Make the human truth boundary emotionally and visually immediate.

## 0:37.600–0:52.800 — GPT-5.6, You, Codex

**Visual:** Hold briefly on the three GPT-5.6 / You / Codex cards, run the build, show **PUBLIC REPLAY**, then use
a readable close-up of the real **VERIFIED LIVE CODEX SDK RUN** receipt link. The final human gate remains below
as context; do not tour or scroll through it.

**Silent beat:** **THREE HANDS. CLEAR BOUNDARIES.**

**Purpose:** Explain who does what and prove the live Codex boundary without stalling the story.

## 0:52.800–1:03.040 — Lantern Lane payoff

**Visual:** Collect Painted, Tasseled, and Pale in quick succession. The last detail closes automatically; hold
on the full-world completion bloom and **3/3 · archive awakened**.

**Silent beat:** **THREE LIGHTS. THREE SOURCES.**

**Purpose:** Show a complete, playful interaction—not just a technical proof.

## 1:03.040–1:14.080 — Repair Bench montage

**Visual:** In a ten-second montage, ring too early and show the reset; then perform Turn → Loosen → Chain → Ring.
End on **4/4 · archive awakened**. Close only the intermediate detail cards; completion closes the final card.

**Silent beat:** **THE MEMORY SETS THE RULES.**

**Purpose:** Prove the runtime produces evidence-shaped mechanics rather than reskinned slideshows.

## 1:14.080–1:24.400 — Engineering evidence

**Visual:** Show one cinematic proof card for 62 tests, four browser journeys, the live Codex SDK receipt, and
zero judge credentials. Reveal the pinned GitHub JSON for no more than two seconds—never tour the repository.

**Silent beat:** **BUILT WITH CODEX. PROVED IN PUBLIC.**

**Purpose:** Give judges verifiable implementation evidence without turning the demo into a repository tour.

## 1:24.400–1:29.261 — Close

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

The release voice uses `gpt-audio-1.5` with the Marin voice for all eight scenes. The generator requests one
continuous performance, aligns its words locally with Whisper, and cuts only inside chapter silence. A phrase
that fails the independent intelligibility gate may be replaced by another take from the same model and voice;
the release closing line uses this path. Every cut keeps 120 ms / 180 ms leading and trailing room plus an 8 ms
silence-region fade, while the renderer adds a 0.9-second visual tail.

Keep the API key in the environment; never pass it as a command-line argument:

```bash
export OPENAI_API_KEY="..."
pnpm voice:openai:continuous -- --out /tmp/keepscape-demo/openai-continuous-marin
```

Re-run local alignment and cutting without paying to regenerate the take:

```bash
pnpm voice:openai:continuous -- \
  --out /tmp/keepscape-demo/openai-continuous-marin \
  --reuse
```

Then render against the externally generated exact transcripts:

```bash
DEMO_OUT=/tmp/keepscape-demo-final \
DEMO_VOICE_DIR=/tmp/keepscape-demo/openai-continuous-marin \
python3 scripts/render_demo.py
```

The narration is synthetic and must remain disclosed in the opening frame and YouTube metadata.
