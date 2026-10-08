"""Visual stability and mobile usability checks for the built site.

Run with a local server on port 8099 and a Python environment with Playwright.
"""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8099/"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page.add_init_script("""
      window.__transitions = 0;
      const original = document.startViewTransition?.bind(document);
      if (original) document.startViewTransition = function(callback) {
        window.__transitions++;
        return original(callback);
      };
    """)
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/fmhy-before-mobile.png", full_page=True)
    bar_before = page.locator(".bar").bounding_box()
    assert bar_before is not None
    page.locator("#q").tap()
    page.evaluate("""() => {
      window.__resultRebuilds = 0;
      new MutationObserver(() => window.__resultRebuilds++).observe(
        document.getElementById('list'), {childList: true}
      );
    }""")
    page.keyboard.type("anime", delay=10)
    page.wait_for_selector("#list .r")
    assert page.evaluate("window.__resultRebuilds") <= 2
    bar_after = page.locator(".bar").bounding_box()
    assert bar_after is not None
    assert abs(bar_before["y"] - bar_after["y"]) < 8, (bar_before, bar_after)
    assert page.evaluate("window.__transitions") == 0
    assert page.evaluate("getComputedStyle(document.body, '::before').animationName") == "none"
    page.screenshot(path="/tmp/fmhy-after-mobile.png", full_page=True)
    page.locator("#clr").tap()
    page.locator("#t-ai").tap()
    page.wait_for_selector("#view .cat-hero")
    assert not page.locator(".hero").is_visible()
    page.screenshot(path="/tmp/fmhy-category-mobile.png")
    browser.close()
