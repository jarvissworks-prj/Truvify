# Truvify — Handoff Notes (19 Nov 2026)

## Latest session — judging polish (frontend only)
No changes to `supabase/`, `src/lib/api.ts`, `src/lib/liveBrowser.ts`, `src/lib/mock.ts` or `src/lib/analysis/`. Verification results are identical to before (same scores in every format test).

- **Landing page**: new sections — the problem (3 sourced statistics), a worked example, a comparison table, who it's for, a "Try it in under a minute" band, architecture and roadmap, rewritten privacy cards, FAQ, footer links. New **Try it free — no sign-up** button starts a guest session and opens `/upload`.
- **Accuracy of copy**: removed claims the code doesn't back up (Semantic Scholar/SciFact/PubMed/JSTOR in browser mode, "full text", "zero AI training", "TLS 1.3/AES-256"). Domain descriptions on `/upload` now match `OUTDATED_AFTER`.
- **ScrollReveal**: content is visible by default; it only animates in after the visitor scrolls. Full-page screenshots no longer show blank sections.
- **Performance**: pages lazy-loaded, export libraries loaded on demand, vendor chunks. Home page JS ≈ 210 KB gzip (was ≈ 700 KB). Build has no warnings.
- **Mobile**: navbar fits one row, results buttons don't wrap, comparison table puts Truvify first, dashboard table has a swipe hint, no sideways scrolling on any page.
- **Accessibility**: skip link, focus outlines, reduced-motion support, `aria-current`, semantic landmarks.
- **SEO/sharing**: meta description, Open Graph/Twitter tags, `public/og-image.png`, JSON-LD, `noscript`.
- **Hosting**: `vercel.json` and `public/_redirects` for deep-link reloads.
- **Fixes**: React Router v7 warnings, a typo in `tests/e2e_formats.py` (`fos`), developer wording on the login page and demo banner, Auto-correct modal button wrapping.
- **Tests**: new `tests/e2e_guest.py` (29 checks, works in demo and live config). All suites pass: guest 29/29, results 20/20, app 12/12, formats, PDF, production build, hover.
- **README** rewritten for judges, with screenshots in `docs/screenshots/`.

---


Read this first, then `CLAUDE.md` (architecture + rules) and `BACKEND_CONTRACT.md` (API).

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npx tsc -b && npm run build   # type check + production build (both pass)
```

With empty Supabase keys in `.env` the app runs in **demo mode** (no backend). Click **Try the demo** on `/login`.

## What changed in this session

### 1. UI and animation upgrades (monochrome theme kept)
| Component | File | Used on |
|---|---|---|
| MagneticButton | `src/components/MagneticButton.tsx` | Landing hero "Verify now" (`distance={0.35}`) |
| ScrollReveal | `src/components/ScrollReveal.tsx` | Landing stat/pipeline/privacy cards, Results summary + every claim card. Default `once=false` (replays scrolling up and down). Adds a `scroll-reveal` class; a print rule in `index.css` keeps cards visible when printing. |
| HaloDropzone | `src/components/HaloDropzone.tsx` | `/upload` (colourful halo kept on purpose). Remounts via `key` to reset after a rejected or removed file. A file row under it shows name, size and remove. |
| AnimatedBackground | `src/components/AnimatedBackground.tsx` | `/upload` domain cards (gliding grey hover highlight) |
| InteractiveCard + InteractiveCardLink | `src/components/InteractiveCard.tsx` | `ClaimCard` (lifting card, verdict accent bar, sliding-arrow DOI links). Hover is detected on a still outer wrapper so the card doesn't flicker near its bottom edge. |
| `cn()` helper | `src/lib/utils.ts` | — |

Packages added: `framer-motion`, `lucide-react`, `clsx`, `tailwind-merge@^2` (**not v3**: v3 is for Tailwind v4), `pdfjs-dist@^4`, `jszip`.

### 2. Demo mode now analyses the real uploaded file
**Problem:** every uploaded file showed the same errors, because `mock.ts` ignored the file and always produced the same sample cardiology report.

**Fix:** a new in-browser verification engine in `src/lib/analysis/` (details in `CLAUDE.md` §6):
read the file (PDF/DOCX/PPTX/XLSX) → find cited sentences and the reference list → look each reference up in **Crossref + OpenAlex** → compare the claim with the abstract → build the report with live progress. The domain is also auto-detected from the text, not the file name.

It produces real verdicts, evidence quotes, date conflicts, overstated-wording flags, suggested fixes, possibly fabricated references (DOI doesn't resolve and title not found), missing references, outdated sources with a newer paper, and retraction/correction notices.

### 3. Bugs fixed
- The same results for every file (above).
- The Progress subtitle said "Opening your results…" while it was still verifying.
- The auto-correct modal showed double brackets (`[[2]]`). The label now reads "Suggested correction (based on the source)".
- A document with no citations showed a trust score of **0 / Red**. It now shows "—", "No claims" and an explanation. The Dashboard average ignores documents with no score.
- "1 pages" is now "1 page".
- Claim cards flickered when hovered near the bottom edge.
- The demo banner text now says files are analysed in the browser.
- Reloading during a verification now shows a clear "interrupted" message.
- A scanned PDF with no text now shows "No readable text was found…".

## Tested (Playwright, real Chrome)
- PDF, DOCX (author–year), PPTX, XLSX and scanned-PDF uploads.
- Results: source notice + Go to claim, verdict and overstated filters, scroll reveal, flag, recheck, override, More + side-by-side, DOI links, PDF/Word/Excel/PowerPoint exports, auto-correct + re-verify, corrected-file download, highlight view. **20/20 pass.**
- App-wide: landing, demo login, dashboard (list/expand/open), sample report, compare, settings, no-citation document, reload mid-job, databases offline (nothing wrongly marked fabricated), logout. **12/12 pass.**
- Production build (`vite preview`): PDF worker loads, deep-link reload works, wrong file type is rejected.

The tests use canned database responses (`tests/fake_db.py`) because the test machine had no internet access. **On your machine, demo mode talks to the real Crossref/OpenAlex APIs, so try a few real papers.**

## Known limits / ideas for next steps
- Demo checks are abstract-level and rule-based, not AI. The live backend should do the LLM comparison (`BACKEND_CONTRACT.md`).
- Superscript citation numbers (¹ ²) aren't detected. Two-column PDFs generally read fine, but unusual layouts may split sentences.
- Up to 60 claims per document in demo mode. Results live in `localStorage` (about 5 MB), so very many large reports can fill it.
- The main JS bundle is about 1.9 MB (Vite warns). Code-splitting the export libraries (`docx`, `jspdf`, `pptxgenjs`, `xlsx`) with dynamic `import()` would help.
- If a site blocks Crossref/OpenAlex (firewall), claims come back "Not found" with an internet note.
