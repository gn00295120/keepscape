import os
from pathlib import Path
from playwright.sync_api import Page, sync_playwright


def assert_clean(page: Page, errors: list[str], label: str) -> None:
    assert not errors, f"{label} browser errors: {errors}"
    assert page.locator("body").evaluate("element => element.scrollWidth") <= page.viewport_size["width"], (
        f"{label} has horizontal overflow"
    )


def attach_error_capture(page: Page, errors: list[str]) -> None:
    def on_console(message) -> None:
        if message.type != "error":
            return
        location = message.location
        suffix = f" @ {location.get('url')}" if location.get("url") else ""
        errors.append(f"{message.text}{suffix}")

    page.on("console", on_console)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on(
        "response",
        lambda response: errors.append(f"HTTP {response.status} {response.url}") if response.status >= 400 else None,
    )


def enter_exhibit(page: Page, sample_index: int, title: str, capture_review: bool = False) -> None:
    page.get_by_role("button", name="Open source desk").nth(sample_index).click()
    page.get_by_role("heading", name="Keep the memory. Question the guess.").wait_for()
    if page.get_by_role("button", name="Confirm as remembered").count():
        page.get_by_role("button", name="Confirm as remembered").click()
    page.get_by_label(
        "I reviewed the displayed claims and all generated exhibit, scene, hotspot, and interaction-draft copy against the listed sources."
    ).check()
    if capture_review:
        page.get_by_role("heading", name="Review the generated story copy.").scroll_into_view_if_needed()
        page.screenshot(path="/tmp/keepscape-qa/source-desk-language-gate.png", full_page=False)
    page.get_by_role("button", name="Approve the story map").click()
    page.get_by_role("heading", name="A memory becomes a place.").wait_for()
    page.get_by_role("button", name="Build this true story").click()
    launch = page.get_by_role("button", name=f"Approve final interaction & enter {title}")
    launch.wait_for(timeout=15_000)
    build_text = page.locator("body").inner_text()
    assert "PUBLIC REPLAY" in build_text, build_text
    assert "VERIFIED LIVE CODEX SDK RUN" in build_text, build_text
    if capture_review:
        page.get_by_role("heading", name="Approve the final interaction language.").scroll_into_view_if_needed()
        page.screenshot(path="/tmp/keepscape-qa/post-codex-language-gate.png", full_page=False)
    launch.click()
    page.get_by_role("heading", name=title, exact=True).first.wait_for()


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")

Path("/tmp/keepscape-qa").mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    desktop_errors: list[str] = []
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    attach_error_capture(page, desktop_errors)
    page.goto(BASE_URL, wait_until="networkidle")
    page.get_by_role("heading", name="Walk into a true story.").wait_for()
    page.screenshot(path="/tmp/keepscape-qa/home-desktop.png", full_page=False)
    enter_exhibit(page, 0, "Lantern Lane, 1998", capture_review=True)
    spatial = page.get_by_role(
        "region",
        name="Generated spatial interpretation: Three photographs remembered one night",
    )
    spatial.wait_for()
    page.screenshot(path="/tmp/keepscape-qa/lantern-start.png", full_page=True)

    spatial.get_by_role("button", name="View flat exhibit").click()
    page.get_by_label("Interactive illustrated scene: Three photographs remembered one night").wait_for()
    page.get_by_role("button", name="Enter spatial view").click()
    spatial.wait_for()
    spatial.get_by_role("button", name="Move deeper").click()
    spatial.get_by_role("button", name="Move deeper").click()
    assert spatial.get_by_role("button", name="Move deeper").is_disabled()
    spatial.get_by_role("button", name="Painted", exact=True).click()
    spatial.get_by_role("button", name="Turn on Evidence Lens", exact=True).click()
    spatial.get_by_text("Evidence Lens active", exact=True).wait_for()
    spatial.get_by_text("cited photo region", exact=True).wait_for()
    page.screenshot(path="/tmp/keepscape-qa/spatial-evidence-lens.png", full_page=True)
    trace_button = spatial.get_by_role("button", name="Open full source archive")
    trace_button.click()
    page.get_by_role("dialog", name="Source archive").wait_for()
    assert page.locator("audio").count() == 1
    assert page.get_by_text("Cited segment 0:00–0:05", exact=False).count() == 1
    page.screenshot(path="/tmp/keepscape-qa/source-drawer.png", full_page=True)
    page.get_by_role("dialog", name="Source archive").get_by_role("button", name="Close source archive").click()
    page.wait_for_timeout(300)
    assert trace_button.evaluate("element => element === document.activeElement")
    spatial.get_by_role("button", name="Evidence Lens on", exact=True).click()
    page.get_by_role("button", name="Close memory detail").click()
    spatial.get_by_role("button", name="Tasseled", exact=True).click()
    page.get_by_role("button", name="Close memory detail").click()
    spatial.get_by_role("button", name="Pale", exact=True).click()
    page.get_by_text("3/3 · archive awakened", exact=False).wait_for()
    page.get_by_text("Three lights, three citations.", exact=True).wait_for()
    page.get_by_text("Archive trail complete", exact=True).wait_for(timeout=2_000)
    page.wait_for_timeout(800)
    page.screenshot(path="/tmp/keepscape-qa/lantern-complete.png", full_page=True)
    assert_clean(page, desktop_errors, "desktop lantern flow")
    page.close()

    sequence_errors: list[str] = []
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    attach_error_capture(page, sequence_errors)
    page.goto(BASE_URL, wait_until="networkidle")
    enter_exhibit(page, 1, "Four Moves at the Repair Bench")
    page.get_by_role("button", name="Ring").click()
    assert "That move came later" in page.locator("body").inner_text()
    for label in ["Turn", "Loosen", "Chain", "Ring"]:
        page.get_by_role("button", name=label).click()
        if label == "Loosen":
            trace_button = page.get_by_role("button", name="Trace to 2 sources")
            trace_button.click()
            drawer = page.get_by_role("dialog", name="Source archive")
            drawer.wait_for()
            assert drawer.get_by_text("AI-generated fictional demo photo · small wrench", exact=True).count() == 1
            assert drawer.get_by_text("Cited segment 0:04–0:06", exact=False).count() == 1
            page.screenshot(path="/tmp/keepscape-qa/repair-source-drawer.png", full_page=True)
            drawer.get_by_role("button", name="Close source archive").click()
            page.wait_for_timeout(300)
            assert trace_button.evaluate("element => element === document.activeElement")
        if label != "Ring":
            page.get_by_role("button", name="Close memory detail").click()
    assert "The wheel turns clean" in page.locator("body").inner_text()
    page.get_by_text("Archive trail complete", exact=True).wait_for(timeout=2_000)
    page.wait_for_timeout(800)
    page.screenshot(path="/tmp/keepscape-qa/repair-complete.png", full_page=True)
    assert_clean(page, sequence_errors, "desktop sequence flow")
    page.close()

    mobile_errors: list[str] = []
    mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    attach_error_capture(mobile, mobile_errors)
    mobile.goto(BASE_URL, wait_until="networkidle")
    mobile.get_by_role("heading", name="Walk into a true story.").wait_for()
    mobile.screenshot(path="/tmp/keepscape-qa/mobile-home.png", full_page=True)
    assert_clean(mobile, mobile_errors, "mobile home")
    mobile.close()

    browser.close()
    print("Keepscape browser QA passed: collect, source drawer, sequence reset/order, desktop, and mobile.")
