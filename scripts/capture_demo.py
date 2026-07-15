import os
import re
import subprocess
import time
from pathlib import Path

from playwright.sync_api import Browser, BrowserContext, Locator, Page, sync_playwright


APP_URL = os.environ.get("APP_URL", "").strip().rstrip("/")
DEMO_SHA = os.environ.get("DEMO_SHA", "").strip()
if not APP_URL:
    raise RuntimeError("APP_URL is required and must point to the final deployed judge experience.")
if not APP_URL.startswith("https://"):
    raise RuntimeError("APP_URL must use HTTPS.")
if not re.fullmatch(r"[0-9a-fA-F]{7,40}", DEMO_SHA):
    raise RuntimeError("DEMO_SHA is required and must be a 7-40 character Git commit SHA.")

REPO_ROOT = "https://github.com/gn00295120/keepscape"
REPO_URL = f"{REPO_ROOT}/tree/{DEMO_SHA}"
RECEIPT_URL = f"{REPO_ROOT}/blob/{DEMO_SHA}/docs/evidence/codex-live-run.json?plain=1"
BUILD_ID = os.environ.get("DEMO_BUILD", "").strip() or DEMO_SHA[:12]
CAPTURE_WIDTH = 1920
CAPTURE_HEIGHT = 1080
DEPLOY_MARKER = os.environ.get(
    "DEMO_DEPLOY_MARKER",
    "AI-generated fictional demo photo · left view",
).strip()
OUT = Path(os.environ.get("DEMO_OUT", "/tmp/keepscape-demo"))
RAW = OUT / "raw"
WORK = OUT / "work"

CLIP_NAMES = {
    "01-loss",
    "02-promise",
    "03-source-desk",
    "04-codex",
    "05-lantern",
    "06-repair",
    "07-engineering",
    "08-close",
}
DEMO_ONLY = {
    name.strip()
    for name in os.environ.get("DEMO_ONLY", "").split(",")
    if name.strip()
}
unknown_clips = DEMO_ONLY - CLIP_NAMES
if unknown_clips:
    raise RuntimeError(f"Unknown DEMO_ONLY clips: {', '.join(sorted(unknown_clips))}")

CURSOR_SCRIPT = """
document.addEventListener('DOMContentLoaded', () => {
  const cursor = document.createElement('div');
  cursor.id = 'keepscape-demo-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = `<svg viewBox="0 0 26 32" width="26" height="32" aria-hidden="true">
    <path d="M2 2v23l6.4-5.8 4.7 10.2 4.2-2-4.7-9.8h8.7L2 2Z" fill="#fff7e7" stroke="#17231e" stroke-width="2.4" stroke-linejoin="round"/>
  </svg>`;
  Object.assign(cursor.style, {
    position: 'fixed', width: '26px', height: '32px',
    pointerEvents: 'none', zIndex: '2147483647', left: '60px', top: '60px',
    opacity: '0', transform: 'translate(-2px, -2px)',
    filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.45))',
    transition: 'opacity 160ms ease, transform 110ms ease'
  });
  document.documentElement.appendChild(cursor);
  document.addEventListener('mousemove', event => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    cursor.style.opacity = '1';
  }, true);
  document.addEventListener('mousedown', () => {
    cursor.style.transform = 'translate(-2px, -2px) scale(.82)';
  }, true);
  document.addEventListener('mouseup', () => {
    cursor.style.transform = 'translate(-2px, -2px) scale(1)';
  }, true);
});
"""


def new_page(browser: Browser) -> tuple[BrowserContext, Page]:
    context = browser.new_context(
        viewport={"width": CAPTURE_WIDTH, "height": CAPTURE_HEIGHT},
        record_video_dir=str(WORK),
        record_video_size={"width": CAPTURE_WIDTH, "height": CAPTURE_HEIGHT},
        color_scheme="light",
        reduced_motion="no-preference",
    )
    context.add_init_script(CURSOR_SCRIPT)
    page = context.new_page()
    page.set_default_timeout(60_000)
    page.set_default_navigation_timeout(60_000)
    return context, page


def should_capture(name: str) -> bool:
    return not DEMO_ONLY or name in DEMO_ONLY


def deployed_url() -> str:
    return f"{APP_URL}/?demo_build={BUILD_ID}"


def goto_deployed_app(page: Page) -> None:
    response = page.goto(deployed_url(), wait_until="networkidle", timeout=60_000)
    if response is None or not response.ok:
        status = response.status if response is not None else "no response"
        raise RuntimeError(f"Final deployment did not load successfully: HTTP {status}")
    page.get_by_role("heading", name="Walk into a true story.").wait_for(timeout=60_000)


def probe_duration(path: Path) -> float:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    value = completed.stdout.strip()
    if not value or value == "N/A":
        raise RuntimeError(f"ffprobe found no valid duration for {path}")
    duration = float(value)
    if duration <= 0:
        raise RuntimeError(f"ffprobe found a non-positive duration for {path}")
    return duration


def save_clip(
    context: BrowserContext,
    page: Page,
    name: str,
    shot_started_at: float,
) -> None:
    shot_duration = max(0.1, time.monotonic() - shot_started_at)
    video = page.video
    page.close()
    context.close()
    if video is None:
        raise RuntimeError(f"Playwright did not create video for {name}")

    full_recording = WORK / f"{name}.full.webm"
    trimmed_recording = WORK / f"{name}.trimmed.webm"
    destination = RAW / f"{name}.webm"
    full_recording.unlink(missing_ok=True)
    trimmed_recording.unlink(missing_ok=True)

    video.save_as(str(full_recording))
    video.delete()

    try:
        full_duration = probe_duration(full_recording)
        retained_duration = min(full_duration, shot_duration + 0.15)
        trim_start = max(0.0, full_duration - retained_duration)
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                f"{trim_start:.3f}",
                "-i",
                str(full_recording),
                "-t",
                f"{retained_duration:.3f}",
                "-an",
                "-c:v",
                "libvpx",
                "-crf",
                "15",
                "-b:v",
                "4M",
                "-pix_fmt",
                "yuv420p",
                str(trimmed_recording),
            ],
            check=True,
        )
        output_duration = probe_duration(trimmed_recording)
        trimmed_recording.replace(destination)
    finally:
        full_recording.unlink(missing_ok=True)
        trimmed_recording.unlink(missing_ok=True)

    print(
        f"saved {destination} "
        f"({output_duration:.2f}s retained from {full_duration:.2f}s recording)"
    )


def pause(page: Page, seconds: float) -> None:
    page.wait_for_timeout(int(seconds * 1000))


def ease_in_out(progress: float) -> float:
    return progress * progress * (3 - 2 * progress)


def move_mouse(page: Page, x: float, y: float, duration: float = 0.55) -> None:
    start_x, start_y = page.evaluate(
        """() => {
          const cursor = document.getElementById('keepscape-demo-cursor');
          return cursor
            ? [Number.parseFloat(cursor.style.left) || 60, Number.parseFloat(cursor.style.top) || 60]
            : [60, 60];
        }"""
    )
    steps = max(2, round(duration / 0.016))
    for step in range(1, steps + 1):
        progress = ease_in_out(step / steps)
        page.mouse.move(
            start_x + (x - start_x) * progress,
            start_y + (y - start_y) * progress,
        )
        pause(page, duration / steps)


def smooth_reveal(page: Page, locator: Locator, block: str = "center", duration: float = 0.8) -> None:
    target_y = locator.evaluate(
        """(element, block) => {
          const rect = element.getBoundingClientRect();
          const absoluteTop = window.scrollY + rect.top;
          if (block === 'start') return absoluteTop - 90;
          if (block === 'end') return absoluteTop - window.innerHeight + rect.height + 90;
          return absoluteTop - (window.innerHeight - rect.height) / 2;
        }""",
        block,
    )
    start_y = page.evaluate("window.scrollY")
    max_y = page.evaluate("Math.max(0, document.documentElement.scrollHeight - window.innerHeight)")
    destination = max(0, min(float(target_y), float(max_y)))
    steps = max(2, round(duration / 0.016))
    for step in range(1, steps + 1):
        progress = ease_in_out(step / steps)
        page.evaluate("y => window.scrollTo(0, y)", start_y + (destination - start_y) * progress)
        pause(page, duration / steps)


def set_page_zoom(page: Page, zoom: float) -> None:
    page.evaluate("value => { document.documentElement.style.zoom = String(value); }", zoom)
    pause(page, 0.6)


def glide_click(
    page: Page,
    locator: Locator,
    duration: float = 0.55,
    settle: float = 0.22,
) -> None:
    needs_scroll = locator.evaluate(
        """element => {
          const rect = element.getBoundingClientRect();
          return rect.top < 48 || rect.bottom > window.innerHeight - 48 ||
            rect.left < 32 || rect.right > window.innerWidth - 32;
        }"""
    )
    if needs_scroll:
        smooth_reveal(page, locator)
    box = locator.bounding_box()
    if box is None:
        raise RuntimeError(f"Could not locate click target: {locator}")
    move_mouse(
        page,
        box["x"] + box["width"] / 2,
        box["y"] + box["height"] / 2,
        duration,
    )
    pause(page, settle)
    locator.click(delay=120)


def glide_drag(page: Page, locator: Locator, delta_x: float, delta_y: float, duration: float = 1.35) -> None:
    box = locator.bounding_box()
    if box is None:
        raise RuntimeError(f"Could not locate drag target: {locator}")
    start_x = box["x"] + box["width"] * 0.54
    start_y = box["y"] + box["height"] * 0.52
    move_mouse(page, start_x, start_y, 0.5)
    page.mouse.down()
    steps = max(2, round(duration / 0.016))
    for step in range(1, steps + 1):
        progress = ease_in_out(step / steps)
        page.mouse.move(start_x + delta_x * progress, start_y + delta_y * progress)
        pause(page, duration / steps)
    page.mouse.up()


def show_transformation_intro(page: Page) -> None:
    page.evaluate(
        """sources => {
          const cursor = document.getElementById('keepscape-demo-cursor');
          if (cursor) cursor.style.opacity = '0';
          const intro = document.createElement('div');
          intro.id = 'keepscape-transformation-intro';
          intro.innerHTML = `
            <div class="demo-intro-copy">
              <small>KEEPSCAPE · A TRACEABLE STORY</small>
              <h1>Three photos.<br>One voice.</h1>
              <p>Becomes a place you can walk into.</p>
            </div>
            <div class="demo-intro-photos">
              ${sources.map((src, index) => `<figure style="--i:${index}"><img src="${src}" alt=""><span>Source 0${index + 1}</span></figure>`).join('')}
            </div>`;
          Object.assign(intro.style, {
            position:'fixed', inset:'0', zIndex:'2147483646', display:'grid',
            gridTemplateColumns:'0.72fr 1.28fr', alignItems:'center', gap:'56px', padding:'72px 86px',
            color:'#f7efdf', background:'radial-gradient(circle at 76% 42%, #29453a 0, #17231e 52%, #101a16 100%)',
            fontFamily:'Arial, sans-serif', opacity:'1', transform:'scale(1)',
            transition:'opacity 700ms ease, transform 900ms cubic-bezier(.2,.78,.2,1)'
          });
          const style = document.createElement('style');
          style.textContent = `
            #keepscape-transformation-intro small { color:#f2bb5a; font:700 14px/1.2 monospace; letter-spacing:.18em; }
            #keepscape-transformation-intro h1 { margin:22px 0 18px; font:750 78px/.92 Georgia,serif; letter-spacing:-.055em; }
            #keepscape-transformation-intro p { margin:0; max-width:24ch; color:#dfe8d6; font:500 24px/1.35 Arial,sans-serif; }
            #keepscape-transformation-intro .demo-intro-photos { position:relative; height:610px; perspective:1100px; }
            #keepscape-transformation-intro figure { position:absolute; top:50%; left:50%; width:520px; margin:0; padding:12px 12px 42px; background:#f5eddd; box-shadow:0 32px 64px rgba(0,0,0,.45); transform:translate(calc(-50% + (var(--i) - 1) * 205px),-50%) rotateY(calc((1 - var(--i)) * 19deg)) translateZ(calc((1 - abs(var(--i) - 1)) * 70px)); }
            #keepscape-transformation-intro figure:nth-child(1) { transform:translate(-88%,-50%) rotateY(20deg) scale(.86); }
            #keepscape-transformation-intro figure:nth-child(2) { z-index:2; transform:translate(-50%,-50%) translateZ(70px); }
            #keepscape-transformation-intro figure:nth-child(3) { transform:translate(-12%,-50%) rotateY(-20deg) scale(.86); }
            #keepscape-transformation-intro img { display:block; width:100%; aspect-ratio:3/2; object-fit:cover; }
            #keepscape-transformation-intro figure span { position:absolute; bottom:14px; left:15px; color:#27372f; font:700 11px/1 monospace; letter-spacing:.12em; text-transform:uppercase; }
          `;
          intro.appendChild(style);
          document.body.appendChild(intro);
        }""",
        [
            f"{APP_URL}/samples/night-market-left-view.webp",
            f"{APP_URL}/samples/night-market-source-photo.webp",
            f"{APP_URL}/samples/night-market-right-view.webp",
        ],
    )


def reveal_exhibit_from_intro(page: Page) -> None:
    page.evaluate(
        """() => {
          const intro = document.getElementById('keepscape-transformation-intro');
          if (!intro) return;
          intro.style.opacity = '0';
          intro.style.transform = 'scale(1.045)';
          window.setTimeout(() => intro.remove(), 900);
        }"""
    )
    pause(page, 1.0)


def show_engineering_overlay(page: Page) -> None:
    page.evaluate(
        """() => {
          const overlay = document.createElement('section');
          overlay.id = 'keepscape-engineering-proof';
          overlay.innerHTML = `
            <div class="proof-head"><small>PUBLIC ENGINEERING EVIDENCE</small><h1>Built with Codex.<br>Proved in the repo.</h1></div>
            <div class="proof-grid">
              <article><strong>62</strong><span>unit tests</span></article>
              <article><strong>4</strong><span>browser flows</span></article>
              <article><strong>LIVE</strong><span>Codex SDK receipt</span></article>
              <article><strong>0</strong><span>judge credentials</span></article>
            </div>
            <p>github.com/gn00295120/keepscape</p>`;
          Object.assign(overlay.style, {
            position:'fixed', inset:'0', zIndex:'2147483646', display:'grid',
            gridTemplateColumns:'0.9fr 1.1fr', alignItems:'center', gap:'64px', padding:'72px 88px',
            color:'#f7efdf', background:'linear-gradient(120deg,rgba(16,27,22,.97),rgba(27,54,44,.94))',
            fontFamily:'Arial,sans-serif', opacity:'0', transition:'opacity 450ms ease'
          });
          const style = document.createElement('style');
          style.textContent = `
            #keepscape-engineering-proof small { color:#f2bb5a; font:700 14px/1 monospace; letter-spacing:.18em; }
            #keepscape-engineering-proof h1 { margin:24px 0 0; font:750 66px/.96 Georgia,serif; letter-spacing:-.05em; }
            #keepscape-engineering-proof .proof-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
            #keepscape-engineering-proof article { display:grid; min-height:190px; align-content:center; padding:28px; border:1px solid rgba(242,187,90,.38); background:rgba(255,255,255,.045); }
            #keepscape-engineering-proof article strong { color:#f2bb5a; font:800 58px/.9 Georgia,serif; }
            #keepscape-engineering-proof article span { margin-top:12px; color:#dfe8d6; font:600 15px/1.2 monospace; text-transform:uppercase; }
            #keepscape-engineering-proof > p { position:absolute; right:88px; bottom:38px; margin:0; color:#b9c9bd; font:500 13px/1 monospace; }
          `;
          overlay.appendChild(style);
          document.body.appendChild(overlay);
          requestAnimationFrame(() => { overlay.style.opacity = '1'; });
        }"""
    )
    pause(page, 0.5)


def hide_overlay(page: Page, overlay_id: str) -> None:
    page.evaluate(
        """id => {
          const overlay = document.getElementById(id);
          if (!overlay) return;
          overlay.style.opacity = '0';
          window.setTimeout(() => overlay.remove(), 500);
        }""",
        overlay_id,
    )
    pause(page, 0.6)


def hide_cursor(page: Page) -> None:
    page.evaluate(
        """() => {
          const cursor = document.getElementById('keepscape-demo-cursor');
          if (cursor) cursor.remove();
        }"""
    )


def verify_final_targets(browser: Browser) -> None:
    context = browser.new_context(
        viewport={"width": 1600, "height": 900},
        color_scheme="light",
        reduced_motion="reduce",
    )
    page = context.new_page()
    page.set_default_timeout(60_000)
    page.set_default_navigation_timeout(60_000)
    try:
        goto_deployed_app(page)
        source_buttons = page.get_by_role("button", name="Open source desk")
        source_buttons.first.wait_for(timeout=60_000)
        if source_buttons.count() < 2:
            raise RuntimeError("Final deployment is missing one or more bundled judge archives.")
        source_buttons.first.click()
        page.get_by_role(
            "heading",
            name="Keep the memory. Question the guess.",
        ).wait_for(timeout=60_000)
        page.get_by_role("heading", name=DEPLOY_MARKER, exact=True).wait_for(timeout=60_000)
        page.get_by_text(
            "The bicycle belonged to someone in the storyteller's family.",
            exact=True,
        ).wait_for(timeout=60_000)

        response = page.goto(RECEIPT_URL, wait_until="domcontentloaded", timeout=60_000)
        if response is None or not response.ok:
            status = response.status if response is not None else "no response"
            raise RuntimeError(f"Pinned GitHub receipt did not load: HTTP {status}")
        page.get_by_text("codexSdkVersion", exact=False).first.wait_for(timeout=60_000)
    finally:
        context.close()

    print(f"preflight passed: {deployed_url()} at Git commit {DEMO_SHA}")


def open_source_desk(page: Page, sample_index: int = 0) -> None:
    goto_deployed_app(page)
    glide_click(page, page.get_by_role("button", name="Open source desk").nth(sample_index))
    page.get_by_role("heading", name="Keep the memory. Question the guess.").wait_for()


def reach_build(page: Page, sample_index: int = 0) -> None:
    open_source_desk(page, sample_index)
    confirm = page.get_by_role("button", name="Confirm as remembered")
    if confirm.count():
        glide_click(page, confirm)
    page.get_by_label(
        "I reviewed the displayed claims and all generated exhibit, scene, hotspot, and interaction-draft copy against the listed sources."
    ).check()
    glide_click(page, page.get_by_role("button", name="Approve the story map"))
    page.get_by_role("heading", name="A memory becomes a place.").wait_for()


def enter_exhibit(page: Page, sample_index: int, title: str) -> None:
    reach_build(page, sample_index)
    glide_click(page, page.get_by_role("button", name="Build this true story"))
    launch = page.get_by_role("button", name=f"Approve final interaction & enter {title}")
    launch.wait_for(timeout=60_000)
    glide_click(page, launch)
    page.get_by_role("region", name=f"{title} playable exhibit").wait_for(timeout=60_000)
    page.evaluate(
        """() => {
          document.documentElement.style.scrollBehavior = "auto";
          window.scrollTo(0, 0);
        }"""
    )
    page.wait_for_function("window.scrollY === 0")


def capture(browser: Browser) -> None:
    if should_capture("01-loss"):
        context, page = new_page(browser)
        enter_exhibit(page, 0, "Lantern Lane, 1998")
        shot_started = time.monotonic()
        spatial = page.get_by_role(
            "region",
            name="Generated spatial interpretation: Three photographs remembered one night",
        )
        viewport = spatial.get_by_label(
            "Walkable photo diorama. Use arrow keys or the camera controls to move."
        )
        show_transformation_intro(page)
        pause(page, 3.4)
        reveal_exhibit_from_intro(page)
        pause(page, 0.8)
        glide_drag(page, viewport, 205, -82)
        pause(page, 1.2)
        glide_click(page, spatial.get_by_role("button", name="Move deeper"))
        pause(page, 1.5)
        glide_click(page, spatial.get_by_role("button", name="Look left"))
        pause(page, 2.2)
        save_clip(context, page, "01-loss", shot_started)

    if should_capture("02-promise"):
        context, page = new_page(browser)
        enter_exhibit(page, 0, "Lantern Lane, 1998")
        shot_started = time.monotonic()
        spatial = page.get_by_role(
            "region",
            name="Generated spatial interpretation: Three photographs remembered one night",
        )
        pause(page, 1.5)
        glide_click(page, spatial.get_by_role("button", name="Move deeper"))
        pause(page, 1.4)
        glide_click(page, spatial.get_by_role("button", name="Painted", exact=True))
        pause(page, 2.2)
        glide_click(page, spatial.get_by_role("button", name="Turn on Evidence Lens", exact=True))
        spatial.get_by_text("cited photo region", exact=True).wait_for()
        pause(page, 3.5)
        glide_click(page, page.get_by_role("button", name="Trace to 3 sources"))
        drawer = page.get_by_role("dialog", name="Source archive")
        drawer.wait_for()
        pause(page, 4.0)
        drawer.locator("audio").scroll_into_view_if_needed()
        pause(page, 4.2)
        save_clip(context, page, "02-promise", shot_started)

    if should_capture("03-source-desk"):
        context, page = new_page(browser)
        open_source_desk(page)
        set_page_zoom(page, 1.18)
        shot_started = time.monotonic()
        pause(page, 3.0)
        uncertain = page.get_by_text("The bicycle belonged to someone in the storyteller's family.")
        smooth_reveal(page, uncertain)
        pause(page, 3.0)
        preserve = page.get_by_role("button", name="Preserve uncertainty")
        glide_click(page, preserve)
        kept_uncertain = page.get_by_text("Kept uncertain", exact=True).last
        kept_uncertain.wait_for()
        pause(page, 3.3)
        language_gate = page.get_by_role("heading", name="Review the generated story copy.")
        smooth_reveal(page, language_gate)
        pause(page, 2.5)
        page.get_by_label(
            "I reviewed the displayed claims and all generated exhibit, scene, hotspot, and interaction-draft copy against the listed sources."
        ).check()
        pause(page, 5.2)
        save_clip(context, page, "03-source-desk", shot_started)

    if should_capture("04-codex"):
        context, page = new_page(browser)
        reach_build(page)
        set_page_zoom(page, 1.12)
        shot_started = time.monotonic()
        pause(page, 4.0)
        glide_click(page, page.get_by_role("button", name="Build this true story"))
        page.get_by_text(
            re.compile(r"^(PUBLIC REPLAY|LIVE RUN)$"),
        ).wait_for(timeout=60_000)
        pause(page, 4.5)
        live_proof = page.get_by_role(
            "link",
            name=re.compile(r"Verified live Codex SDK run", re.IGNORECASE),
        )
        smooth_reveal(page, live_proof)
        pause(page, 4.5)
        final_gate = page.get_by_role("heading", name="Approve the final interaction language.")
        smooth_reveal(page, final_gate)
        pause(page, 7.5)
        save_clip(context, page, "04-codex", shot_started)

    if should_capture("05-lantern"):
        context, page = new_page(browser)
        enter_exhibit(page, 0, "Lantern Lane, 1998")
        shot_started = time.monotonic()
        spatial = page.get_by_role(
            "region",
            name="Generated spatial interpretation: Three photographs remembered one night",
        )
        pause(page, 0.8)
        glide_click(
            page, spatial.get_by_role("button", name="Move deeper"), 0.3, 0.1
        )
        pause(page, 0.7)
        glide_click(
            page, spatial.get_by_role("button", name="Painted", exact=True), 0.3, 0.1
        )
        pause(page, 0.8)
        glide_click(page, page.get_by_role("button", name="Close memory detail"), 0.3, 0.1)
        glide_click(
            page, spatial.get_by_role("button", name="Tasseled", exact=True), 0.3, 0.1
        )
        pause(page, 0.8)
        glide_click(page, page.get_by_role("button", name="Close memory detail"), 0.3, 0.1)
        glide_click(
            page, spatial.get_by_role("button", name="Pale", exact=True), 0.3, 0.1
        )
        complete = page.get_by_text("Archive trail complete", exact=True)
        complete.wait_for()
        pause(page, 0.7)
        glide_click(page, page.get_by_role("button", name="Close memory detail"), 0.3, 0.1)
        smooth_reveal(page, complete, duration=0.7)
        pause(page, 4.5)
        save_clip(context, page, "05-lantern", shot_started)

    if should_capture("06-repair"):
        context, page = new_page(browser)
        enter_exhibit(page, 1, "Four Moves at the Repair Bench")
        shot_started = time.monotonic()
        pause(page, 1.5)
        glide_click(page, page.get_by_role("button", name="Ring"), 0.38, 0.12)
        pause(page, 2.2)
        for label in ["Turn", "Loosen", "Chain", "Ring"]:
            glide_click(page, page.get_by_role("button", name=label), 0.38, 0.12)
            pause(page, 0.85)
            if label != "Ring":
                glide_click(
                    page,
                    page.get_by_role("button", name="Close memory detail"),
                    0.38,
                    0.12,
                )
        complete = page.get_by_text("Archive trail complete", exact=True)
        complete.wait_for()
        pause(page, 0.7)
        glide_click(
            page,
            page.get_by_role("button", name="Close memory detail"),
            0.38,
            0.12,
        )
        smooth_reveal(page, complete, duration=0.7)
        pause(page, 5.0)
        save_clip(context, page, "06-repair", shot_started)

    if should_capture("07-engineering"):
        context, page = new_page(browser)
        # Warm the pinned receipt in this browser context before the recorded
        # shot so GitHub latency cannot consume its readable screen time.
        response = page.goto(RECEIPT_URL, wait_until="domcontentloaded", timeout=60_000)
        if response is None or not response.ok:
            status = response.status if response is not None else "no response"
            raise RuntimeError(f"Pinned GitHub receipt did not preload: HTTP {status}")
        page.get_by_text("codexSdkVersion", exact=False).first.wait_for(timeout=60_000)

        response = page.goto(REPO_URL, wait_until="domcontentloaded", timeout=60_000)
        if response is None or not response.ok:
            status = response.status if response is not None else "no response"
            raise RuntimeError(f"Pinned GitHub repository did not load: HTTP {status}")
        page.get_by_text("Walk into a true story.", exact=True).first.wait_for(timeout=60_000)
        shot_started = time.monotonic()
        show_engineering_overlay(page)
        pause(page, 6.2)
        hide_overlay(page, "keepscape-engineering-proof")
        set_page_zoom(page, 1.16)
        pause(page, 1.4)
        response = page.goto(RECEIPT_URL, wait_until="domcontentloaded", timeout=60_000)
        if response is None or not response.ok:
            status = response.status if response is not None else "no response"
            raise RuntimeError(f"Pinned GitHub receipt did not load: HTTP {status}")
        receipt_marker = page.get_by_text("codexSdkVersion", exact=False).first
        receipt_marker.wait_for(timeout=60_000)
        set_page_zoom(page, 1.34)
        pause(page, 7.5)
        save_clip(context, page, "07-engineering", shot_started)

    if should_capture("08-close"):
        context, page = new_page(browser)
        goto_deployed_app(page)
        shot_started = time.monotonic()
        hide_cursor(page)
        pause(page, 0.4)
        page.evaluate("""
          const close = document.createElement('div');
          close.innerHTML = '<small>KEEPSCAPE</small><h1>Walk into a true story.</h1><p>Every fact has a way home.</p><footer>keepscape.lucasfutures-h1-20260507.workers.dev · github.com/gn00295120/keepscape</footer>';
          Object.assign(close.style, {position:'fixed', inset:'0', zIndex:'2147483646', display:'grid',
            placeContent:'center', textAlign:'center', color:'#f2eadb', background:'#17231e',
            fontFamily:'"Archivo Variable", "IBM Plex Sans Variable", sans-serif', letterSpacing:'-.03em'});
          close.querySelector('small').style.cssText='font:600 16px monospace;letter-spacing:.25em;color:#f2bb5a';
          close.querySelector('h1').style.cssText='margin:24px 0 12px;font-size:86px;line-height:.95';
          close.querySelector('p').style.cssText='margin:0;font:400 18px monospace;letter-spacing:.08em';
          close.querySelector('footer').style.cssText='margin-top:42px;color:#b8c9bd;font:400 13px monospace;letter-spacing:.02em';
          document.body.appendChild(close);
        """)
        pause(page, 6.2)
        save_clip(context, page, "08-close", shot_started)


RAW.mkdir(parents=True, exist_ok=True)
WORK.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        verify_final_targets(browser)
        capture(browser)
    finally:
        browser.close()

print(f"Demo clips written to {RAW}")
