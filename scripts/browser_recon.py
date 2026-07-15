import os

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.goto(BASE_URL, wait_until="networkidle")
    page.screenshot(path="/tmp/keepscape-home.png", full_page=True)
    print({
        "title": page.title(),
        "h1": page.locator("h1").all_text_contents(),
        "buttons": page.get_by_role("button").all_text_contents(),
        "console_errors": console_errors,
        "page_errors": page_errors,
        "body_width": page.locator("body").evaluate("element => element.scrollWidth"),
        "viewport_width": page.viewport_size["width"],
    })
    browser.close()
