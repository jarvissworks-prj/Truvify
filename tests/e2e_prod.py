import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_db import route
from playwright.sync_api import sync_playwright
BASE = "http://localhost:4173"; FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures") + os.sep
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.route("https://api.crossref.org/**", route); ctx.route("https://api.openalex.org/**", route)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"PAGEERROR {e}"))
    pg.goto(BASE + "/login"); pg.get_by_role("button", name="Try the demo").click(); pg.wait_for_url("**/upload")
    pg.set_input_files("input[type=file]", FIX + "notes.txt"); pg.wait_for_timeout(600)
    print("wrong type ->", pg.get_by_role("alert").inner_text())
    pg.set_input_files("input[type=file]", FIX + "Cardio_Prevention_Draft.pdf")
    pg.wait_for_selector("text=Domain auto-detected", timeout=20000)
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots") + "/upload_prod.png", full_page=True)
    pg.get_by_role("button", name="Start verification").click()
    pg.wait_for_url("**/results/**", timeout=60000); pg.wait_for_selector("text=Verification report"); pg.wait_for_timeout(800)
    store = json.loads(pg.evaluate("localStorage.getItem('truvify_demo_store_v1')"))
    d = store["documents"][0]
    print("PROD BUILD:", d["file_name"], "claims", d["claim_count"], "score", d["trust_score"])
    pg.goto(BASE + "/results/" + d["id"]); pg.wait_for_selector("text=Verification report")
    print("deep link reload OK")
    pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots") + "/results_prod.png", full_page=False)
    b.close()
print("PAGE ERRORS:", errors or "none")
