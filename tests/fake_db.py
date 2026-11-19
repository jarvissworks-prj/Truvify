import os
"""Fake Crossref + OpenAlex responses for browser tests (the real APIs are blocked in this sandbox)."""
import json, re, urllib.parse

def inv(text):
    idx = {}
    for i, w in enumerate(text.split()):
        idx.setdefault(w, []).append(i)
    return idx

PAPERS = {
    "10.1056/nejmoa1804988": dict(title="Effects of Aspirin for Primary Prevention in Persons with Diabetes Mellitus", year=2018, journal="New England Journal of Medicine",
        authors=[("ASCEND Study", "Collaborative Group")], cr_abstract=None,
        oa_abstract="Aspirin use prevented serious vascular events in persons who had diabetes and no evident cardiovascular disease at trial entry, but it also caused major bleeding events. Serious vascular events occurred in a significantly lower percentage of participants in the aspirin group than in the placebo group (8.5% vs. 9.6%; rate ratio, 0.88). Major bleeding events occurred in 4.1% of the participants in the aspirin group and 3.2% in the placebo group."),
    "10.1016/s0140-6736(13)61752-3": dict(title="The Framingham Heart Study and the epidemiology of cardiovascular disease: a historical perspective", year=2014, journal="The Lancet",
        authors=[("Syed S", "Mahmood"), ("Daniel", "Levy")],
        cr_abstract="<jats:p>On Sept 29, 1948, the Framingham Heart Study enrolled its first participant. The Framingham Heart Study began enrolling participants in 1948 under the direction of the National Heart Institute. Its findings shaped modern preventive cardiology.</jats:p>",
        oa_abstract=None, updated_by=[{"type": "correction", "updated": {"date-parts": [[2014, 6, 1]]}}]),
    "10.1056/nejmoa1811403": dict(title="Marine n-3 Fatty Acids and Prevention of Cardiovascular Disease and Cancer", year=2019, journal="New England Journal of Medicine",
        authors=[("JoAnn E", "Manson"), ("Nancy R", "Cook")], cr_abstract=None,
        oa_abstract="Supplementation with n-3 fatty acids did not result in a lower incidence of major cardiovascular events or cancer than placebo in healthy adults. The primary end points were major cardiovascular events and invasive cancer."),
    "10.7326/0003-4819-136-7-200204020-00006": dict(title="Effect of Aerobic Exercise on Blood Pressure: A Meta-Analysis of Randomized, Controlled Trials", year=2002, journal="Annals of Internal Medicine",
        authors=[("Seamus P", "Whelton"), ("Jiang", "He")],
        cr_abstract="Aerobic exercise was associated with a significant reduction in mean systolic blood pressure of 3.84 mm Hg. Reductions in systolic blood pressure were seen in hypertensive participants of 4.94 mm Hg.", oa_abstract=None),
    "10.1002/14651858.cd004937": dict(title="Effect of longer-term modest salt reduction on blood pressure", year=2004, journal="Cochrane Database of Systematic Reviews",
        authors=[("Feng J", "He"), ("Graham A", "MacGregor")],
        cr_abstract="A modest reduction in salt intake for four or more weeks causes significant falls in blood pressure in hypertensive and normotensive adults.", oa_abstract=None,
        updated_by=[{"type": "new_version", "updated": {"date-parts": [[2013, 4, 30]]}}]),
    "10.1073/pnas.0611508104": dict(title="Soil erosion and agricultural sustainability", year=2007, journal="PNAS", authors=[("David R", "Montgomery")],
        cr_abstract="Data compiled from around the world show that soil erosion under conventional agriculture exceeds rates of soil production. Conservation agriculture based on no-till farming reduces soil erosion to rates closer to soil production.", oa_abstract=None),
    "10.1038/s41467-017-02142-7": dict(title="An assessment of the global impact of 21st century land use change on soil erosion", year=2017, journal="Nature Communications", authors=[("Pasquale", "Borrelli")],
        cr_abstract="We estimate that global soil erosion rates increased mainly because of cropland expansion between 2001 and 2012.", oa_abstract=None),
    "10.1016/j.scitotenv.2015.01.008": dict(title="Rainfall erosivity in Europe", year=2015, journal="Science of The Total Environment", authors=[("Panos", "Panagos")],
        cr_abstract="Rainfall erosivity is highest in Mediterranean regions of Europe and in the Alpine area, and lowest in Scandinavia.", oa_abstract=None),
}
NEWER = dict(title="Aerobic exercise and blood pressure in adults with hypertension: an updated meta-analysis", year=2021, doi="10.9999/newer.2021.777",
             abstract="Aerobic exercise lowered systolic blood pressure by 5 to 8 mm Hg in adults with hypertension. Effects were larger with higher weekly volume.")

def cr_item(doi, p):
    m = {"DOI": doi, "title": [p["title"]], "issued": {"date-parts": [[p["year"]]]}, "container-title": [p["journal"]],
         "author": [{"given": g, "family": f} for g, f in p["authors"]]}
    if p.get("cr_abstract"): m["abstract"] = p["cr_abstract"]
    if p.get("updated_by"): m["updated-by"] = p["updated_by"]
    return m

def oa_item(doi, p):
    return {"doi": f"https://doi.org/{doi}", "title": p["title"], "publication_year": p["year"],
            "primary_location": {"source": {"display_name": p["journal"]}},
            "authorships": [{"author": {"display_name": f"{g} {f}"}} for g, f in p["authors"]],
            "abstract_inverted_index": inv(p["oa_abstract"]) if p.get("oa_abstract") else None, "is_retracted": False}

def handle(url):
    """Returns (status, json) for a Crossref/OpenAlex URL."""
    u = urllib.parse.urlparse(url)
    path = urllib.parse.unquote(u.path)
    qs = urllib.parse.parse_qs(u.query)
    if u.netloc == "api.crossref.org":
        m = re.match(r"^/works/(.+)$", path)
        if m:
            doi = m.group(1).lower()
            return (200, {"message": cr_item(doi, PAPERS[doi])}) if doi in PAPERS else (404, {})
        q = (qs.get("query.bibliographic") or [""])[0].lower()
        items = []
        if "aerobic exercise on blood pressure" in q:
            d = "10.7326/0003-4819-136-7-200204020-00006"; items.append(cr_item(d, PAPERS[d]))
        items.append({"DOI": "10.1234/unrelated", "title": ["Unrelated paper about marine sediments"], "issued": {"date-parts": [[2012]]}})
        return 200, {"message": {"items": items}}
    if u.netloc == "api.openalex.org":
        m = re.match(r"^/works/https://doi\.org/(.+)$", path)
        if m:
            doi = m.group(1).lower()
            return (200, oa_item(doi, PAPERS[doi])) if doi in PAPERS else (404, {})
        search = (qs.get("search") or [""])[0].lower()
        if "from_publication_date" in (qs.get("filter") or [""])[0] and "aerobic" in search:
            return 200, {"results": [{"doi": f"https://doi.org/{NEWER['doi']}", "title": NEWER["title"], "publication_year": NEWER["year"],
                                      "authorships": [{"author": {"display_name": "A Researcher"}}], "abstract_inverted_index": inv(NEWER["abstract"])}]}
        return 200, {"results": []}
    return 404, {}

def route(r):
    status, body = handle(r.request.url)
    r.fulfill(status=status, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(body))
