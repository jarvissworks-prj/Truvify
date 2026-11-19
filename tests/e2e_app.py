import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_db import route
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173"; FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures") + os.sep; SHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots") + os.sep; os.makedirs(SHOT, exist_ok=True)
errors, results = [], []
def ok(name, cond, extra=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name, extra)

def start_upload(pg, name):
    pg.goto(BASE + "/upload")
    pg.set_input_files("input[type=file]", FIX + name)
    pg.wait_for_selector("text=Domain auto-detected", timeout=20000)
    pg.get_by_role("button", name="Start verification").click()
    pg.wait_for_url("**/progress/**", timeout=10000)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    ctx.route("https://api.crossref.org/**", route); ctx.route("https://api.openalex.org/**", route)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"PAGEERROR {e}"))
    pg.on("console", lambda m: m.type == "error" and "404" not in m.text and "ERR_FAILED" not in m.text and errors.append(m.text))

    # Landing
    pg.goto(BASE + "/"); pg.wait_for_timeout(800)
    ok("landing hero", pg.get_by_role("link", name="Verify now").count() >= 1)
    pg.screenshot(path=SHOT + "landing.png")
    # Scroll all the way down (the page length changes as sections are added).
    for y in range(0, pg.evaluate("document.body.scrollHeight") + 500, 500):
        pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(150)
    pg.wait_for_timeout(600)
    op = pg.locator(".scroll-reveal").last.evaluate("e => getComputedStyle(e).opacity")
    ok("landing scroll reveal", float(op) > 0.95, f"opacity={op}")
    pg.screenshot(path=SHOT + "landing_bottom.png")

    # Demo login + sample report still works
    pg.goto(BASE + "/login"); pg.get_by_role("button", name="Try the demo").click(); pg.wait_for_url("**/upload")
    pg.goto(BASE + "/dashboard"); pg.wait_for_selector("text=Document history")
    pg.wait_for_timeout(600)
    ok("dashboard lists sample docs", pg.get_by_text("Cardio_Review_v1.pdf").count() > 0)
    pg.get_by_role("button", name="View").first.click(); pg.wait_for_timeout(900)
    ok("dashboard expand row", pg.get_by_text("Input file").count() > 0)
    pg.screenshot(path=SHOT + "dashboard.png", full_page=True)
    pg.get_by_role("link", name="Open", exact=True).first.click(); pg.wait_for_url("**/results/**"); pg.wait_for_selector("text=Verification report")
    ok("sample report opens", pg.locator("[id^=claim-]").count() >= 7)
    ok("sample report notice", pg.get_by_text("Source update notice").count() > 0)

    # Compare
    pg.goto(BASE + "/compare"); pg.wait_for_timeout(1000)
    sels = pg.locator("select")
    opts = sels.nth(0).locator("option").all_inner_texts()
    sels.nth(0).select_option(index=1); sels.nth(1).select_option(index=2); pg.wait_for_timeout(1500)
    pg.screenshot(path=SHOT + "compare.png", full_page=True)
    txt = pg.locator("main").inner_text() if pg.locator("main").count() else pg.content()
    ok("compare renders", "score" in txt.lower() or "claims" in txt.lower(), f"options={len(opts)}")

    # Settings menu
    pg.get_by_role("button", name="Settings").click(); pg.wait_for_timeout(400)
    pg.screenshot(path=SHOT + "settings.png")
    ok("settings menu", pg.get_by_text("Log out").count() > 0)
    pg.keyboard.press("Escape")

    # No citations
    start_upload(pg, "Notes_No_Citations.pdf")
    pg.wait_for_url("**/results/**", timeout=40000); pg.wait_for_selector("text=Verification report"); pg.wait_for_timeout(600)
    pg.screenshot(path=SHOT + "no_citations.png", full_page=True)
    body = pg.locator("body").inner_text()
    ok("no-citation doc shows message", "No claims" in body or "no cited" in body.lower() or "No citation" in body, body[body.find("All claims"):body.find("All claims")+200].replace("\n"," | "))

    # Interrupted by reload
    start_upload(pg, "Cardio_Prevention_Draft.pdf")
    pg.reload(); pg.wait_for_timeout(2500)
    ok("reload mid-job shows interrupted", "interrupted" in pg.locator("body").inner_text().lower())

    # Offline databases
    ctx.unroute("https://api.crossref.org/**"); ctx.unroute("https://api.openalex.org/**")
    ctx.route("https://api.crossref.org/**", lambda r: r.abort()); ctx.route("https://api.openalex.org/**", lambda r: r.abort())
    start_upload(pg, "Soil_Erosion_Essay.docx")
    pg.wait_for_url("**/results/**", timeout=60000); pg.wait_for_selector("text=Verification report"); pg.wait_for_timeout(500)
    store = json.loads(pg.evaluate("localStorage.getItem('truvify_demo_store_v1')"))
    doc = store["documents"][0]; cl = [c for c in store["claims"] if c["document_id"] == doc["id"]]
    ok("offline: claims not checked, nothing marked fabricated", all(c["verdict"] == "not_found" for c in cl) and cl,
       cl[0]["explanation"] if cl else "")

    # Logout
    pg.get_by_role("button", name="Settings").click(); pg.get_by_text("Log out").click(); pg.wait_for_timeout(800)
    ok("logout", "/login" in pg.url or pg.get_by_role("link", name="Verify now").count() > 0, pg.url)
    b.close()
print("\nERRORS:", errors or "none")
print(f"{sum(r for _,r in results)}/{len(results)} passed")
