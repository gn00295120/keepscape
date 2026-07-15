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
  Object.assign(cursor.style, {
    position: 'fixed', width: '18px', height: '18px', borderRadius: '999px',
    border: '2px solid #fff1cf', background: '#df4b2f', boxShadow: '0 0 0 3px rgba(23,35,30,.65)',
    pointerEvents: 'none', zIndex: '2147483647', left: '60px', top: '60px',
    transform: 'translate(-50%, -50%)', transition: 'width 120ms, height 120ms'
  });
  document.documentElement.appendChild(cursor);
  document.addEventListener('mousemove', event => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
  }, true);
  document.addEventListener('mousedown', () => {
    cursor.style.width = '30px'; cursor.style.height = '30px';
  }, true);
  document.addEventListener('mouseup', () => {
    cursor.style.width = '18px'; cursor.style.height = '18px';
  }, true);
});
"""


def new_page(browser: Browser) -> tuple[BrowserContext, Page]:
    context = browser.new_context(
        viewport={"width": 1600, "height": 900},
        record_video_dir=str(WORK),
        record_video_size={"width": 1600, "height": 900},
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


def glide_click(page: Page, locator: Locator) -> None:
    locator.scroll_into_view_if_needed()
    box = locator.bounding_box()
    if box is None:
        raise RuntimeError(f"Could not locate click target: {locator}")
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps=18)
    pause(page, 0.35)
    page.mouse.down()
    pause(page, 0.16)
    page.mouse.up()


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
        page.get_by_text(DEPLOY_MARKER, exact=True).wait_for(timeout=60_000)
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
        pause(page, 2)
        glide_click(page, spatial.get_by_role("button", name="Move deeper"))
        pause(page, 3)
        glide_click(page, spatial.get_by_role("button", name="Look right"))
        pause(page, 3)
        glide_click(page, spatial.get_by_role("button", name="Look left"))
        pause(page, 3)
        save_clip(context, page, "01-loss", shot_started)

    if should_capture("02-promise"):
        context, page = new_page(browser)
        goto_deployed_app(page)
        shot_started = time.monotonic()
        glide_click(page, page.get_by_role("button", name="Enter Lantern Lane"))
        pause(page, 4)
        page.mouse.move(470, 610, steps=24)
        pause(page, 3)
        glide_click(page, page.get_by_role("button", name="Open source desk").first)
        page.get_by_role("heading", name="Keep the memory. Question the guess.").wait_for()
        pause(page, 7)
        save_clip(context, page, "02-promise", shot_started)

    if should_capture("03-source-desk"):
        context, page = new_page(browser)
        open_source_desk(page)
        shot_started = time.monotonic()
        pause(page, 3)
        uncertain = page.get_by_text("The bicycle belonged to someone in the storyteller's family.")
        uncertain.scroll_into_view_if_needed()
        pause(page, 5)
        confirm = page.get_by_role("button", name="Confirm as remembered")
        glide_click(page, confirm)
        pause(page, 3)
        page.get_by_text("Family confirmed", exact=True).last.scroll_into_view_if_needed()
        pause(page, 3)
        language_gate = page.get_by_role("heading", name="Review the generated story copy.")
        language_gate.evaluate("element => element.scrollIntoView({ block: 'center' })")
        pause(page, 2)
        page.get_by_label(
            "I reviewed the displayed claims and all generated exhibit, scene, hotspot, and interaction-draft copy against the listed sources."
        ).check()
        pause(page, 5)
        save_clip(context, page, "03-source-desk", shot_started)

    if should_capture("04-codex"):
        context, page = new_page(browser)
        reach_build(page)
        shot_started = time.monotonic()
        pause(page, 4)
        glide_click(page, page.get_by_role("button", name="Build this true story"))
        page.get_by_text(
            re.compile(r"^(VALIDATED FALLBACK|LIVE RUN)$"),
        ).wait_for(timeout=60_000)
        pause(page, 6)
        page.get_by_text("Actual run trace + release checks", exact=True).scroll_into_view_if_needed()
        pause(page, 6)
        final_gate = page.get_by_role("heading", name="Approve the final interaction language.")
        final_gate.evaluate("element => element.scrollIntoView({ block: 'center' })")
        pause(page, 7)
        save_clip(context, page, "04-codex", shot_started)

    if should_capture("05-lantern"):
        context, page = new_page(browser)
        enter_exhibit(page, 0, "Lantern Lane, 1998")
        shot_started = time.monotonic()
        spatial = page.get_by_role(
            "region",
            name="Generated spatial interpretation: Three photographs remembered one night",
        )
        pause(page, 2)
        glide_click(page, spatial.get_by_role("button", name="Move deeper"))
        pause(page, 2)
        glide_click(page, spatial.get_by_role("button", name="Painted", exact=True))
        pause(page, 3)
        glide_click(page, spatial.get_by_role("button", name="Turn on Evidence Lens", exact=True))
        spatial.get_by_text("cited photo region", exact=True).wait_for()
        pause(page, 5)
        glide_click(page, page.get_by_role("button", name="Trace to 3 sources"))
        drawer = page.get_by_role("dialog", name="Source archive")
        drawer.wait_for()
        pause(page, 5)
        drawer.locator("audio").scroll_into_view_if_needed()
        pause(page, 5)
        glide_click(page, drawer.get_by_role("button", name="Close source archive"))
        pause(page, 1)
        glide_click(page, page.get_by_role("button", name="Close memory detail"))
        glide_click(page, spatial.get_by_role("button", name="Tasseled", exact=True))
        pause(page, 1)
        glide_click(page, page.get_by_role("button", name="Close memory detail"))
        glide_click(page, spatial.get_by_role("button", name="Pale", exact=True))
        page.get_by_text("Archive trail complete", exact=True).wait_for()
        pause(page, 8)
        save_clip(context, page, "05-lantern", shot_started)

    if should_capture("06-repair"):
        context, page = new_page(browser)
        enter_exhibit(page, 1, "Four Moves at the Repair Bench")
        shot_started = time.monotonic()
        pause(page, 3)
        glide_click(page, page.get_by_role("button", name="Ring"))
        pause(page, 4)
        for label in ["Turn", "Loosen", "Chain", "Ring"]:
            glide_click(page, page.get_by_role("button", name=label))
            pause(page, 1.4)
            if label != "Ring":
                glide_click(page, page.get_by_role("button", name="Close memory detail"))
        page.get_by_text("Archive trail complete", exact=True).wait_for()
        pause(page, 7)
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
        pause(page, 3)
        page.mouse.wheel(0, 670)
        pause(page, 2)
        response = page.goto(RECEIPT_URL, wait_until="domcontentloaded", timeout=60_000)
        if response is None or not response.ok:
            status = response.status if response is not None else "no response"
            raise RuntimeError(f"Pinned GitHub receipt did not load: HTTP {status}")
        receipt_marker = page.get_by_text("codexSdkVersion", exact=False).first
        receipt_marker.wait_for(timeout=60_000)
        receipt_marker.scroll_into_view_if_needed()
        pause(page, 8)
        save_clip(context, page, "07-engineering", shot_started)

    if should_capture("08-close"):
        context, page = new_page(browser)
        goto_deployed_app(page)
        shot_started = time.monotonic()
        pause(page, 1)
        page.evaluate("""
          const close = document.createElement('div');
          close.innerHTML = '<small>KEEPSCAPE</small><h1>Walk into a true story.</h1><p>Every fact has a way home.</p>';
          Object.assign(close.style, {position:'fixed', inset:'0', zIndex:'2147483646', display:'grid',
            placeContent:'center', textAlign:'center', color:'#f2eadb', background:'#17231e',
            fontFamily:'"Archivo Variable", "IBM Plex Sans Variable", sans-serif', letterSpacing:'-.03em'});
          close.querySelector('small').style.cssText='font:600 16px monospace;letter-spacing:.25em;color:#f2bb5a';
          close.querySelector('h1').style.cssText='margin:24px 0 12px;font-size:86px;line-height:.95';
          close.querySelector('p').style.cssText='margin:0;font:400 18px monospace;letter-spacing:.08em';
          document.body.appendChild(close);
        """)
        pause(page, 6)
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
