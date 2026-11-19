import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_db import route
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173"; FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures") + os.sep; SHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots") + os.sep; os.makedirs(SHOT, exist_ok=True)
errors, results = [], []
def ok(name, cond, extra=""):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name, extra)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    ctx.route("https://api.crossref.org/**", route); ctx.route("https://api.openalex.org/**", route)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"PAGEERROR {e}"))
    pg.on("console", lambda m: m.type == "error" and "404" not in m.text and errors.append(m.text))
    pg.goto(BASE + "/login"); pg.get_by_role("button", name="Try the demo").click(); pg.wait_for_url("**/upload")
    pg.set_input_files("input[type=file]", FIX + "Cardio_Prevention_Draft.pdf")
    pg.wait_for_selector("text=Domain auto-detected", timeout=20000)
    pg.get_by_role("button", name="Start verification").click()
    pg.wait_for_url("**/results/**", timeout=60000); pg.wait_for_selector("text=Verification report")
    pg.wait_for_timeout(700)

    # banner + go to claim
    ok("source notice banner", pg.locator("text=Source update notice").is_visible())
    pg.get_by_text("Go to claim →").first.click(); pg.wait_for_timeout(1200)
    ok("go to claim scrolls", pg.evaluate("window.scrollY") > 300)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(500)

    # filters
    n_all = pg.locator("[id^=claim-]").count()
    pg.get_by_role("button", name="Contradicted 1").click(); pg.wait_for_timeout(500)
    ok("verdict filter", pg.locator("[id^=claim-]").count() == 1, f"(all={n_all})")
    pg.get_by_role("button", name="Clear filter").click(); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Overstated claims:").click(); pg.wait_for_timeout(500)
    ok("overstated filter", pg.locator("[id^=claim-]").count() >= 1, f"count={pg.locator('[id^=claim-]').count()}")
    pg.get_by_role("button", name="Clear filter").click(); pg.wait_for_timeout(400)

    # scroll reveal: all claim cards become visible after scrolling through
    for y in range(0, 6000, 400):
        pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(120)
    last = pg.locator("[id^=claim-]").last
    op = last.evaluate("e => getComputedStyle(e.parentElement).opacity")
    ok("scroll reveal shows last card", float(op) > 0.95, f"opacity={op}")
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(600)

    # claim card actions on first card
    card = pg.locator("[id^=claim-]").first
    def center(loc):
        loc.evaluate("e => e.scrollIntoView({block: 'center'})"); pg.wait_for_timeout(450)
    center(card.get_by_role("button", name="Flag"))
    card.get_by_role("button", name="Flag").click(); pg.wait_for_timeout(500)
    ok("flag", card.get_by_text("Flagged").count() > 0)
    center(card.get_by_role("button", name="Recheck")); card.get_by_role("button", name="Recheck").click(); pg.wait_for_timeout(1500)
    ok("recheck", "Rechecked" in card.inner_text())
    center(card.get_by_role("button", name="Override verdict")); card.get_by_role("button", name="Override verdict").click()
    card.locator("select").select_option("supported")
    card.locator("input[placeholder^='e.g.']").fill("Checked the full text.")
    center(card.get_by_role("button", name="Save")); card.get_by_role("button", name="Save").click(); pg.wait_for_timeout(700)
    ok("override", card.get_by_text("User reviewed").count() > 0)
    center(card.get_by_role("button", name="More").first); card.get_by_role("button", name="More").first.click(); pg.wait_for_timeout(400)
    ok("more + side by side", card.get_by_text("Side by side").count() > 0)
    ok("DOI link w/ arrow", card.locator("a[href^='https://doi.org/']").count() > 0)
    pg.screenshot(path=SHOT + "claim_card.png")

    # exports
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(500)
    for label in ["PDF", "Word", "Excel", "PowerPoint"]:
        try:
            if label == "PDF":
                with ctx.expect_page(timeout=8000) as pinfo:
                    pg.get_by_role("button", name=label, exact=True).click()
                newp = pinfo.value; newp.wait_for_load_state(); 
                ok(f"export {label}", "Verification" in newp.content() or len(newp.content()) > 2000); newp.close()
            else:
                with pg.expect_download(timeout=15000) as d:
                    pg.get_by_role("button", name=label, exact=True).click()
                path = d.value.path(); ok(f"export {label}", os.path.getsize(path) > 1000, f"{d.value.suggested_filename} {os.path.getsize(path)}B")
        except Exception as e:
            ok(f"export {label}", False, str(e)[:150])
        pg.wait_for_timeout(600)

    # auto-correct
    pg.get_by_role("button", name="Auto-correct (").first.click(); pg.wait_for_timeout(500)
    modal_text = pg.locator("[role=dialog], .fixed").filter(has_text="Auto-Correct Document").last.inner_text()
    ok("auto-correct modal opens", "original text" in modal_text.lower())
    ok("no double brackets", "[[" not in modal_text, "")
    pg.get_by_role("button", name="Permit all").click()
    pg.get_by_role("button", name="& re-verify").click()
    pg.wait_for_timeout(4000)
    store = json.loads(pg.evaluate("localStorage.getItem('truvify_demo_store_v1')"))
    doc = store["documents"][0]
    cl = {c["citation_id"]: c for c in store["claims"] if c["document_id"] == doc["id"]}
    ok("auto-correct fixed [2] date", "1948" in cl["[2]"]["claim_text"] and cl["[2]"]["verdict"] == "supported", f'{cl["[2]"]["verdict"]}')
    ok("corrected_text saved", bool(doc.get("corrected_text")))
    pg.screenshot(path=SHOT + "after_autocorrect.png")

    # corrected file download
    try:
        with pg.expect_download(timeout=15000) as d:
            pg.get_by_role("button", name="Download corrected file").click()
        ok("download corrected file", os.path.getsize(d.value.path()) > 500, d.value.suggested_filename)
    except Exception as e:
        ok("download corrected file", False, str(e)[:150])

    # highlight view
    pg.get_by_role("button", name="Highlight view off").click(); pg.wait_for_timeout(800)
    marks = pg.locator("mark").count()
    ok("highlight view shows marks", marks >= 5, f"marks={marks}")
    pg.screenshot(path=SHOT + "highlight.png", full_page=True)
    b.close()
print("\nERRORS:", errors or "none")
print(f"{sum(r for _,r in results)}/{len(results)} passed")
