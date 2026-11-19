import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None, args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    pg.goto("http://localhost:5173/login"); pg.get_by_role("button", name="Try the demo").click(); pg.wait_for_url("**/upload")
    pg.goto("http://localhost:5173/dashboard"); pg.get_by_role("link", name="Open", exact=True).first.click()
    pg.wait_for_selector("[id^=claim-]"); pg.wait_for_timeout(800)
    card = pg.locator("[id^=claim-]").nth(1)
    card.evaluate("e => e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(700)
    box = card.bounding_box()
    pg.mouse.move(box["x"] + 200, box["y"] + box["height"] - 2)  # 2px above the bottom edge
    samples = []
    for _ in range(12):
        pg.wait_for_timeout(100)
        samples.append(card.evaluate("e => e.firstElementChild.getBoundingClientRect().top.toFixed(1)"))
    print("inner card top over 1.2s:", samples)
    print("STABLE" if len(set(samples[4:])) == 1 else "FLICKERING")
    b.close()
