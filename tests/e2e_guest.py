"""Guest journey — the path a first-time visitor (or a judge) takes.

Landing → "Try it free — no sign-up" → upload → "Load Demo Paper" → progress → report →
auto-correct modal → exports menu → dashboard → compare → exit guest session.
Also checks: no horizontal overflow on phones, landing sections present, skip link,
no console errors.

Works in demo mode and in live mode (guest sessions never touch Supabase).
    BASE=http://localhost:5173 python tests/e2e_guest.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_db import route
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:5173")
errors, results = [], []


def ok(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name, extra)


def watch(pg, label):
    pg.on("pageerror", lambda e: errors.append(f"{label} PAGEERROR {e}"))
    pg.on("console", lambda m: m.type == "error" and "404" not in m.text and "ERR_FAILED" not in m.text and errors.append(f"{label} {m.text}"))


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])

    # ---------------------------------------------------------------- desktop journey
    ctx = b.new_context(viewport={"width": 1366, "height": 900}, accept_downloads=True)
    ctx.route("https://api.crossref.org/**", route)
    ctx.route("https://api.openalex.org/**", route)
    pg = ctx.new_page()
    watch(pg, "desktop")

    pg.goto(BASE + "/")
    pg.wait_for_timeout(800)
    pg.keyboard.press("Tab")
    ok("skip link is first focus", pg.evaluate("document.activeElement && document.activeElement.textContent.trim()") == "Skip to content")
    for sec in ["problem", "example", "how-it-works", "different", "who", "try", "scale", "privacy", "faq"]:
        ok(f"landing section #{sec}", pg.locator(f"#{sec}").count() == 1)
    ok("problem stats link to sources", pg.locator("#problem a[href^='https://']").count() == 3)
    ok("comparison table", pg.locator("#different table tbody tr").count() == 7)
    pg.locator("#faq summary").first.click()
    ok("faq opens", pg.locator("#faq details[open]").count() == 1)

    # full-page screenshot must not contain blank (hidden) sections
    hidden = pg.evaluate("[...document.querySelectorAll('.scroll-reveal')].filter(e => parseFloat(getComputedStyle(e).opacity) < 0.5).length")
    ok("no hidden sections before scrolling", hidden == 0, f"hidden={hidden}")

    pg.get_by_role("button", name="Try it free — no sign-up").first.click()
    pg.wait_for_url("**/upload", timeout=15000)
    pg.wait_for_selector("text=Upload your document", timeout=15000)
    ok("try-free starts guest session", "GUEST MODE" in pg.locator("body").inner_text())

    pg.get_by_role("button", name="Load Demo Paper (.pdf)").click()
    pg.wait_for_selector("text=Domain auto-detected", timeout=30000)
    ok("demo paper loads", pg.get_by_text("Truvify_Verification_Demo_Paper.pdf").count() > 0)
    ok("medical domain detected", "Medical" in pg.locator("text=Domain auto-detected").inner_text())
    pg.get_by_role("button", name="Start verification").click()
    pg.wait_for_url("**/progress/**", timeout=15000)
    pg.wait_for_url("**/results/**", timeout=90000)
    pg.wait_for_selector("text=Verification report", timeout=20000)
    n = pg.locator("[id^=claim-]").count()
    ok("report shows claims", n >= 5, f"claims={n}")
    ok("fabricated reference caught", pg.get_by_text("Likely fabricated").count() > 0)

    pg.get_by_role("button", name="Auto-correct").first.click()
    pg.wait_for_timeout(500)
    ok("auto-correct modal", pg.get_by_text("Suggested correction").count() > 0)
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(300)

    with pg.expect_download(timeout=30000) as dl:
        pg.get_by_role("button", name="Excel", exact=True).click()
    ok("excel export", dl.value.suggested_filename.endswith(".xlsx"), dl.value.suggested_filename)

    pg.goto(BASE + "/dashboard")
    pg.wait_for_selector("text=Document history", timeout=15000)
    try:
        pg.wait_for_selector("text=Truvify_Verification_Demo_Paper.pdf", timeout=10000)
    except Exception:
        pass
    ok("dashboard lists the report", pg.get_by_text("Truvify_Verification_Demo_Paper.pdf").count() > 0)
    pg.goto(BASE + "/compare")
    pg.wait_for_timeout(1000)
    ok("compare page opens", pg.locator("select").count() >= 2)

    pg.get_by_role("button", name="Settings").click()
    pg.get_by_role("button", name="Exit guest session").click()
    pg.wait_for_url(BASE + "/", timeout=10000)
    pg.wait_for_timeout(800)
    ok("exit guest session", pg.get_by_role("button", name="Try it free — no sign-up").count() >= 1)
    ctx.close()

    # ---------------------------------------------------------------- phone layout
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg = ctx.new_page()
    watch(pg, "phone")
    for path in ["/", "/login", "/signup", "/does-not-exist"]:
        pg.goto(BASE + path)
        pg.wait_for_timeout(900)
        sw = pg.evaluate("Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)")
        ok(f"phone fits {path}", sw <= 390, f"width={sw}")
    nav_h = pg.evaluate("document.querySelector('header').getBoundingClientRect().height")
    ok("phone navbar one row", nav_h <= 60, f"height={nav_h}")
    ctx.close()
    b.close()

print("\nERRORS:", "\n".join(errors) or "none")
passed = sum(1 for _, c in results if c)
print(f"{passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) and not errors else 1)
