import os, sys, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_db import route
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures") + os.sep
errors = []
os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots"), exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    ctx.route("https://api.crossref.org/**", route)
    ctx.route("https://api.openalex.org/**", route)
    pg = ctx.new_page()
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.on("pageerror", lambda e: errors.append(f"PAGEERROR {e}"))

    pg.goto(BASE + "/login")
    pg.get_by_role("button", name="Try the demo").click()
    pg.wait_for_url("**/upload", timeout=10000)

    pg.set_input_files("input[type=file]", FIX + "Cardio_Prevention_Draft.pdf")
    pg.wait_for_selector("text=Domain auto-detected", timeout=20000)
    print("detected:", pg.locator("text=Domain auto-detected").inner_text())
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots") + "/upload.png", full_page=True)
    pg.get_by_role("button", name="Start verification").click()
    pg.wait_for_url("**/progress/**", timeout=10000)
    pg.wait_for_timeout(1200)
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots") + "/progress.png", full_page=True)
    pg.wait_for_url("**/results/**", timeout=60000)
    pg.wait_for_selector("text=Verification report", timeout=15000)
    pg.wait_for_timeout(800)
    # read claims from storage
    store = json.loads(pg.evaluate("localStorage.getItem('truvify_demo_store_v1')"))
    doc = store["documents"][0]
    print("doc:", doc["file_name"], "pages", doc["page_count"], "score", doc["trust_score"], "claims", doc["claim_count"], "domain", doc["domain"])
    for c in [c for c in store["claims"] if c["document_id"] == doc["id"]]:
        print(f'- p{c["page_number"]} {c["citation_id"]:6} {c["verdict"]:18} out={c["outdated"]} dc={bool(c["date_conflict"])} fix={c.get("suggested_fix")!r}')
        print("     claim:", c["claim_text"][:110])
        print("     why:", (c["explanation"] or "")[:150])
    print("sourceChanges:", json.dumps(store.get("sourceChanges", {}).get(doc["id"]), indent=0)[:400])
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots") + "/results_top.png")
    print("URL", pg.url)
    b.close()
print("CONSOLE ERRORS:", errors or "none")
