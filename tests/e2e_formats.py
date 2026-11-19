import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_db import route
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173"; FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures") + os.sep
errors = []

def upload(pg, name):
    pg.goto(BASE + "/upload")
    pg.set_input_files("input[type=file]", FIX + name)
    pg.wait_for_selector("text=Domain auto-detected", timeout=20000)
    detected = pg.locator("text=Domain auto-detected").inner_text()
    pg.get_by_role("button", name="Start verification").click()
    pg.wait_for_url("**/progress/**", timeout=10000)
    try:
        pg.wait_for_url("**/results/**", timeout=45000)
    except Exception:
        pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots", f"fail_{name}.png"), full_page=True)
        return detected, None, pg.locator("main").inner_text()[:600]
    store = json.loads(pg.evaluate("localStorage.getItem('truvify_demo_store_v1')"))
    doc = store["documents"][0]
    return detected, doc, [c for c in store["claims"] if c["document_id"] == doc["id"]]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.route("https://api.crossref.org/**", route); ctx.route("https://api.openalex.org/**", route)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"PAGEERROR {e}"))
    pg.goto(BASE + "/login"); pg.get_by_role("button", name="Try the demo").click(); pg.wait_for_url("**/upload")
    for name in ["Soil_Erosion_Essay.docx", "Aspirin_Talk.pptx", "Omega3_Table.xlsx", "Scanned_No_Text.pdf"]:
        detected, doc, claims = upload(pg, name)
        print(f"\n=== {name} | {detected}")
        if doc is None:
            print("FAILED/ERROR PAGE:", claims.replace("\n", " | ")); continue
        print("pages", doc["page_count"], "claims", doc["claim_count"], "score", doc["trust_score"])
        for c in claims:
            print(f'- p{c["page_number"]} {c["citation_id"]:28} {c["verdict"]:17} src={c["source_used"]} ref={(c["citation_full_reference"] or "")[:45]!r}')
            print("     ", c["claim_text"][:100], "|", (c["explanation"] or "")[:110])
    b.close()
print("\nPAGE ERRORS:", errors or "none")
