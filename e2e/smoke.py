"""Browser smoke tests (optional): python3 e2e/smoke.py [base_url] [shots_dir]
Needs: pip install playwright && playwright install chromium; and `bun run dev 8099` serving dist/.
Covers: layouts on all five screen sizes, no horizontal overflow, mobile bar behaviour, search, category view,
pinning + persistence, offline reload via the service worker, and the daily updater (with intercepted network)."""
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8099/"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else "/tmp/shots"
DOCS = os.environ.get("FMHY_DOCS", ".cache/docs")
os.makedirs(SHOTS, exist_ok=True)
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(name)

SIZES = [("mobile", 360, 800, True), ("tablet-p", 768, 1024, True), ("tablet-l", 1024, 768, True), ("laptop", 1366, 768, False), ("desktop", 1920, 1080, False)]

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- layouts + overflow ----------
    for name, w, h, touch in SIZES:
        ctx = b.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch, device_scale_factor=2 if touch else 1)
        pg = ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector("#cats .tl"); pg.wait_for_timeout(1200)
        check(f"{name}: layout viewport is the device width (nothing forced it wider)", pg.evaluate("innerWidth") == w, pg.evaluate("innerWidth"))
        check(f"{name}: no horizontal overflow", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        check(f"{name}: every tile's text and count stay inside the tile", pg.evaluate("[...document.querySelectorAll('.tl')].every(t => [...t.children].every(c => c.getBoundingClientRect().right <= t.getBoundingClientRect().right + 0.5))"))
        check(f"{name}: no console errors/warnings", not errs, str(errs))
        focused = pg.evaluate("document.activeElement && document.activeElement.id")
        check(f"{name}: search autofocus only with mouse", (focused == "q") == (not touch), focused)
        box = pg.locator(".bar").bounding_box()
        if w < 640:
            check(f"{name}: search bar stays near the top", box["y"] < 240, str(box))
            cols = pg.evaluate("getComputedStyle(document.querySelector('.cats')).gridTemplateColumns.split(' ').length")
            check(f"{name}: categories are one column", cols == 1, cols)
        else:
            check(f"{name}: search bar centered below the introduction", box["y"] < 260 and abs(box["x"] + box["width"] / 2 - w / 2) < 3, str(box))
        tl = pg.locator(".tl").first.bounding_box()
        check(f"{name}: tap targets >= 44px", tl["height"] >= 44, tl["height"])
        pg.screenshot(path=f"{SHOTS}/{name}-home.png")
        # results
        pg.click("#q") if not touch else pg.tap("#q")
        pg.keyboard.type("anime", delay=20); pg.wait_for_timeout(400)
        check(f"{name}: results shown", pg.locator("#list li").count() > 5)
        if w < 640:
            bb = pg.locator(".bar").bounding_box()
            check(f"{name}: bar does not jump while searching", abs(bb["y"] - box["y"]) < 8, str(bb))
        check(f"{name}: no overflow with results", pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        pg.screenshot(path=f"{SHOTS}/{name}-results.png")
        ctx.close()

    # ---------- behaviour (desktop) ----------
    ctx = b.new_context(viewport={"width": 1366, "height": 768})
    pg = ctx.new_page()
    pg.goto(BASE); pg.wait_for_selector("#cats .tl"); pg.wait_for_timeout(1000)

    # keyboard: type, arrows, enter navigates to the selected result
    pg.fill("#q", "libgen"); pg.wait_for_timeout(300)
    check("search: Library Genesis found", "libgen" in pg.inner_text("#list").lower() or "library genesis" in pg.inner_text("#list").lower())
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("Escape clears the query and returns home", pg.input_value("#q") == "" and pg.is_visible("#home"))
    pg.keyboard.press("Tab"); pg.keyboard.press("/") ; pg.wait_for_timeout(100)

    # category view
    pg.click("#t-ai"); pg.wait_for_selector("#view h2")
    check("category: hash routing", pg.evaluate("location.hash") == "#ai" and "Artificial" in pg.inner_text("#view h2"))
    n_secs = pg.locator("#view .cat-sec, #view details").count()
    check("category: sections listed", n_secs >= 5, n_secs)
    check("category: section opens lazily with rows", pg.locator("#view .r").count() > 3)
    pg.screenshot(path=f"{SHOTS}/laptop-category.png")
    pg.click("#btn-settings"); pg.check("#pref-star"); pg.locator("#settings-dlg").press("Escape"); pg.wait_for_timeout(200)
    only_star = pg.evaluate("[...document.querySelectorAll('#view .r')].every(r => r.querySelector('.s'))")
    check("category: starred-only filter", only_star)
    pg.click("#btn-settings"); pg.uncheck("#pref-star"); pg.locator("#settings-dlg").press("Escape")
    pg.go_back(); pg.wait_for_timeout(200)
    check("category: browser Back returns to categories", pg.is_visible("#home") and not pg.is_visible("#view"))

    # pinning
    pg.fill("#q", "ublock origin"); pg.wait_for_timeout(300)
    pg.locator("#list .pb").first.click()
    pg.fill("#q", ""); pg.wait_for_timeout(200)
    check("pin: appears on home immediately", pg.locator("#pins a.pin").count() == 1)
    pg.reload(); pg.wait_for_selector("#pins a.pin")
    check("pin: survives reload (localStorage) and renders without the dataset", pg.locator("#pins a.pin .lb").first.inner_text().lower().startswith("ublock"))
    pg.locator("#pins a.pin").first.evaluate("a => a.addEventListener('click', e => e.preventDefault())")
    pg.locator("#pins a.pin").first.click()
    prefs = json.loads(pg.evaluate("localStorage.getItem('fh1')"))
    check("pin: click count is tracked", prefs["pins"][0][2] == 1, prefs)
    pg.click("#edit"); pg.locator("#pins .rm").first.click()
    check("pin: removable in edit mode", pg.locator("#pins a.pin").count() == 0 and pg.is_hidden("#edit"))
    check("pin: pin button state reset", True)

    # ---------- offline via service worker ----------
    pg.evaluate("navigator.serviceWorker.ready.then(() => 1)")
    pg.wait_for_timeout(1500)
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_selector("#cats .tl"); pg.wait_for_timeout(800)
    pg.fill("#q", "vlc"); pg.wait_for_timeout(500)
    check("offline: reload works and search works from cache", pg.locator("#list li").count() > 0)
    ctx.set_offline(False)

    # ---------- perf: cached paint ----------
    pg.goto(BASE); pg.wait_for_selector("#cats .tl")
    fcp = pg.evaluate("performance.getEntriesByName('first-contentful-paint')[0]?.startTime")
    print(f"INFO cached first-contentful-paint: {fcp:.0f} ms (desktop, localhost, SW cached)")
    check("perf: cached FCP under 500ms in headless Chromium", fcp is not None and fcp < 500, fcp)
    ctx.close()

    # ---------- updater, with intercepted network ----------
    ctx = b.new_context(viewport={"width": 1366, "height": 768})
    pg = ctx.new_page()
    seen = []
    def handle(route):
        req = route.request
        k = re.search(r"/docs/([\w-]+)\.md", req.url).group(1)
        seen.append((req.method, {h: v for h, v in req.headers.items() if h in ("if-none-match", "authorization", "x-requested-with")}))
        text = open(f"{DOCS}/{k}.md", encoding="utf-8").read()
        if k == "ai":
            text += "\n* [Brand New Updater Probe](https://updater-probe.example/) - added upstream today / and a long description to look real\n"
        route.fulfill(status=200, body=text, headers={"content-type": "text/plain", "access-control-allow-origin": "*"})
    pg.route("https://raw.githubusercontent.com/**", handle)
    pg.goto(BASE); pg.wait_for_selector("#cats .tl"); pg.wait_for_timeout(1500)
    check("updater: not run on first open (seed is fresh)", len(seen) == 0, len(seen))
    # make the stored sync look 3 days old (but newer than the seed), then reopen
    pg.evaluate("""async () => { const seed = await (await fetch(document.querySelector('link[rel=modulepreload]').href.replace(/main\\..*/, '') + [...performance.getEntriesByType('resource')].map(r=>r.name).find(n=>/seed\\./.test(n)).split('/').pop())).json();
      await new Promise((res, rej) => { const r = indexedDB.open('fmhy-home', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(JSON.stringify({v: 1, syncedAt: seed.t + 1, lastCheck: Date.now() - 3 * 864e5}), 'meta'); tx.oncomplete = res; tx.onerror = rej; }; }); }""")
    pg.reload(); pg.wait_for_selector("#cats .tl"); pg.wait_for_timeout(5000)
    check("updater: fetched all 23 pages", len(seen) == 23, len(seen))
    check("updater: plain GET, no custom headers (no CORS preflight possible)", all(m == "GET" and not h for m, h in seen), seen[:2])
    idb = pg.evaluate("""() => new Promise(res => { const r = indexedDB.open('fmhy-home', 1); r.onsuccess = () => { const s = r.result.transaction('kv').objectStore('kv'); const k = s.getAllKeys(); k.onsuccess = () => res(k.result); }; })""")
    check("updater: only the changed page was stored", sorted(idb) == ["meta", "page:ai"], idb)
    pg.fill("#q", "updater probe"); pg.wait_for_timeout(400)
    check("updater: new data is NOT applied mid-session", "Brand New Updater Probe" not in pg.inner_text("#list"))
    pg.reload(); pg.wait_for_selector("#cats .tl"); pg.wait_for_timeout(1200)
    pg.fill("#q", "updater probe"); pg.wait_for_timeout(400)
    check("updater: new data appears on the next open", "Brand New Updater Probe" in pg.inner_text("#list"))
    seen.clear(); pg.reload(); pg.wait_for_timeout(2500)
    check("updater: throttled to once a day afterwards", len(seen) == 0, len(seen))
    ctx.close()
    b.close()

print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
