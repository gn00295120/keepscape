import os
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")
OUT = Path("/tmp/keepscape-qa")
OUT.mkdir(exist_ok=True)


def enter_lantern_lane(page: Page) -> None:
    page.goto(BASE_URL, wait_until="networkidle")
    page.get_by_role("button", name="Open source desk").first.click()
    page.get_by_role("heading", name="Keep the memory. Question the guess.").wait_for()
    confirm = page.get_by_role("button", name="Confirm as remembered")
    if confirm.count():
        confirm.click()
    page.get_by_label(
        "I reviewed the displayed claims and all generated exhibit, scene, hotspot, and interaction-draft copy against the listed sources."
    ).check()
    page.get_by_role("button", name="Approve the story map").click()
    page.get_by_role("button", name="Build this true story").click()
    launch = page.get_by_role("button", name="Approve final interaction & enter Lantern Lane, 1998")
    launch.wait_for(timeout=30_000)
    launch.click()
    page.get_by_role("region", name="Lantern Lane, 1998 playable exhibit").wait_for()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    enter_lantern_lane(page)

    spatial = page.get_by_role("region", name="Generated spatial interpretation: Three photographs remembered one night")
    spatial.wait_for()
    assert spatial.get_by_text("Generated space · traceable story", exact=True).count() == 1
    assert spatial.get_by_text("Source plane", exact=True).count() == 3
    page.wait_for_timeout(1_400)
    page.screenshot(path=str(OUT / "spatial-start.png"), full_page=True)

    spatial.get_by_role("button", name="Move deeper").click()
    spatial.get_by_role("button", name="Look right").click()
    painted = spatial.get_by_role("button", name="Painted", exact=True)
    painted.click()
    page.wait_for_timeout(300)
    if painted.get_attribute("aria-pressed") != "true":
        hit_test = painted.evaluate("""
            element => {
              const rect = element.getBoundingClientRect();
              const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
              return {
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                targetTag: target?.tagName,
                targetClass: target?.getAttribute('class'),
                targetText: target?.textContent,
                buttonContainsTarget: target ? element.contains(target) : false,
              };
            }
        """)
        raise AssertionError(f"A real pointer click did not select Painted. Hit test: {hit_test}")
    page.get_by_role("heading", name="The painted lantern", exact=True).wait_for()

    spatial.get_by_role("button", name="Turn on Evidence Lens", exact=True).click()
    spatial.get_by_text("Evidence Lens active", exact=True).wait_for()
    spatial.get_by_text("cited photo region", exact=True).wait_for()
    page.wait_for_timeout(700)
    page.screenshot(path=str(OUT / "spatial-evidence-lens.png"), full_page=True)

    spatial.get_by_role("button", name="Open full source archive").click()
    drawer = page.get_by_role("dialog", name="Source archive")
    drawer.wait_for()
    drawer.get_by_text("AI-generated fictional demo photo · left view", exact=True).wait_for()
    drawer.get_by_text("Cited segment 0:00–0:05", exact=False).wait_for()
    page.screenshot(path=str(OUT / "spatial-source-drawer.png"), full_page=True)
    drawer.get_by_role("button", name="Close source archive").click()

    spatial.get_by_role("button", name="Evidence Lens on", exact=True).click()
    page.get_by_role("button", name="Close memory detail").click()
    spatial.get_by_role("button", name="Tasseled", exact=True).click()
    page.get_by_role("button", name="Close memory detail").click()
    spatial.get_by_role("button", name="Pale", exact=True).click()
    page.get_by_text("Archive trail complete", exact=True).wait_for()
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / "spatial-complete.png"), full_page=True)

    assert page.locator("body").evaluate("element => element.scrollWidth") <= page.viewport_size["width"]
    page.close()

    mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    enter_lantern_lane(mobile)
    mobile_spatial = mobile.get_by_role(
        "region",
        name="Generated spatial interpretation: Three photographs remembered one night",
    )
    mobile_spatial.get_by_role("button", name="Painted", exact=True).click()
    mobile_spatial.get_by_role("button", name="Turn on Evidence Lens", exact=True).click()
    mobile_spatial.get_by_text("cited photo region", exact=True).wait_for()
    mobile.wait_for_timeout(700)
    mobile.screenshot(path=str(OUT / "mobile-spatial-evidence-lens.png"), full_page=True)
    assert mobile.locator("body").evaluate("element => element.scrollWidth") <= mobile.viewport_size["width"]
    mobile.close()

    browser.close()

print("Keepscape spatial QA passed: bounded movement, Evidence Lens, source receipt, collection, and mobile.")
