import os
from pathlib import Path
from playwright.sync_api import Page, sync_playwright


def assert_clean(page: Page, errors: list[str], label: str) -> None:
    assert not errors, f"{label} browser errors: {errors}"
    assert page.locator("body").evaluate("element => element.scrollWidth") <= page.viewport_size["width"], (
        f"{label} has horizontal overflow"
    )


def enter_exhibit(page: Page, sample_index: int, title: str) -> None:
    page.get_by_role("button", name="Open source desk").nth(sample_index).click()
    page.get_by_role("heading", name="Keep the memory. Question the guess.").wait_for()
    if page.get_by_role("button", name="Confirm as remembered").count():
        page.get_by_role("button", name="Confirm as remembered").click()
    page.get_by_role("button", name="Approve the story map").click()
    page.get_by_role("heading", name="A memory becomes a place.").wait_for()
    page.get_by_role("button", name="Build this true story").click()
    launch = page.get_by_role("button", name=f"Enter {title}")
    launch.wait_for(timeout=15_000)
    assert "Demo fallback" in page.locator("body").inner_text()
    launch.click()
    page.get_by_role("heading", name=title, exact=True).first.wait_for()


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")

Path("/tmp/keepscape-qa").mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    desktop_errors: list[str] = []
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.on("console", lambda message: desktop_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: desktop_errors.append(str(error)))
    page.goto(BASE_URL, wait_until="networkidle")
    enter_exhibit(page, 0, "Lantern Lane, 1998")
    page.screenshot(path="/tmp/keepscape-qa/lantern-start.png", full_page=True)

    page.get_by_role("button", name="Painted").click()
    page.get_by_role("button", name="Trace to 3 sources").click()
    page.get_by_role("dialog", name="Source archive").wait_for()
    assert page.locator("audio").count() == 1
    assert page.get_by_text("Cited segment 0:00–0:05", exact=False).count() == 1
    page.screenshot(path="/tmp/keepscape-qa/source-drawer.png", full_page=True)
    page.get_by_role("dialog", name="Source archive").get_by_role("button", name="Close source archive").click()
    page.wait_for_timeout(100)
    assert page.get_by_role("button", name="Trace to 3 sources").evaluate("element => element === document.activeElement")
    page.get_by_role("button", name="Close memory detail").click()
    page.get_by_role("button", name="Tasseled").click()
    page.get_by_role("button", name="Close memory detail").click()
    page.get_by_role("button", name="Pale").click()
    assert "Three lights, three citations" in page.locator("body").inner_text()
    page.get_by_text("Archive trail complete", exact=True).wait_for(timeout=2_000)
    page.screenshot(path="/tmp/keepscape-qa/lantern-complete.png", full_page=True)
    assert_clean(page, desktop_errors, "desktop lantern flow")
    page.close()

    sequence_errors: list[str] = []
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.on("console", lambda message: sequence_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: sequence_errors.append(str(error)))
    page.goto(BASE_URL, wait_until="networkidle")
    enter_exhibit(page, 1, "Four Moves at the Repair Bench")
    page.get_by_role("button", name="Ring").click()
    assert "That move came later" in page.locator("body").inner_text()
    for label in ["Turn", "Loosen", "Chain", "Ring"]:
        page.get_by_role("button", name=label).click()
        if label != "Ring":
            page.get_by_role("button", name="Close memory detail").click()
    assert "The wheel turns clean" in page.locator("body").inner_text()
    page.get_by_text("Archive trail complete", exact=True).wait_for(timeout=2_000)
    page.screenshot(path="/tmp/keepscape-qa/repair-complete.png", full_page=True)
    assert_clean(page, sequence_errors, "desktop sequence flow")
    page.close()

    mobile_errors: list[str] = []
    mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    mobile.on("console", lambda message: mobile_errors.append(message.text) if message.type == "error" else None)
    mobile.on("pageerror", lambda error: mobile_errors.append(str(error)))
    mobile.goto(BASE_URL, wait_until="networkidle")
    mobile.get_by_role("heading", name="Walk into a true story.").wait_for()
    mobile.screenshot(path="/tmp/keepscape-qa/mobile-home.png", full_page=True)
    assert_clean(mobile, mobile_errors, "mobile home")
    mobile.close()

    browser.close()
    print("Keepscape browser QA passed: collect, source drawer, sequence reset/order, desktop, and mobile.")
