# Intake

**Tax document extraction and review for professional preparers.**

A preparer drops in a client's tax documents (W-2s, 1099s, 1098s). Intake OCRs
them, extracts structured box-level data with the Groq API, validates it against
real tax rules, and surfaces exceptions first so the preparer verifies what's
flagged — not every field.

The product is not the extraction. It's the review-and-verify workflow. A tax
preparer will never blindly trust extracted data, so Intake is built around the
moment a red validation flag turns green when a value is corrected.

---

## What it does

- **Client-side OCR.** Digital PDFs are read via their embedded text layer
  (`pdfjs-dist`); scanned PDFs and images are rasterized and run through
  `tesseract.js`. Documents containing SSNs never leave the browser as images —
  **only OCR text is sent to the server.** This is a genuine privacy posture for
  tax data, not a shortcut.
- **AI extraction (Groq with Gemini fallback).** The server route sends OCR text to
  `llama-3.3-70b-versatile`, then uses Gemini only if Groq fails and a
  `GEMINI_API_KEY` is configured. The provider classifies the form and transcribes each
  field into a typed schema with a per-field confidence score. Values are
  transcribed exactly as printed; absent fields come back `null`, never guessed.
- **Deterministic validation.** Pure functions re-check every field on every
  edit: TIN formats, W-2 arithmetic (SS/Medicare rates, wage base), 1099-R
  taxable-amount and distribution-code rules, withholding sanity, required
  fields, and low-confidence flags.
- **Review workflow.** Flagged fields sort to the top under "Needs your review";
  clean fields collapse below. Editing re-validates instantly and the field's
  flag rail changes color in place. Confirming is always an explicit action.
- **Export.** CSV (one row per document, money as plain numbers) and JSON (full
  fidelity — confidences, validation flags, and edit history with the original
  extracted value preserved alongside the correction).

## Supported forms

W-2, 1099-NEC, 1099-INT, 1099-DIV, 1099-R, 1099-MISC, 1099-SA, 1098, 1099-G, SSA-1099,
Schedule K-1 (1065, 1120-S, 1041), 1098-E, 1098-T, charitable donation receipts,
and an `UNKNOWN`
fallback that does generic key/value extraction and labels the document
"Unrecognized — raw extraction" rather than erroring out.

---

## Validation rules

Extraction and decision-making are deliberately **two separate layers**. The
Groq model only transcribes — it classifies the form, returns each field's value
exactly as printed, and reports a confidence. It never decides whether a document
is trustworthy. Every one of those values is then re-checked by pure,
deterministic functions in [`lib/validate.ts`](lib/validate.ts) before the
preparer sees a verdict. The model is treated as an untrusted transcriber.

### From flags to a decision

Each rule emits a flag: `{ fieldKey, severity: 'error' | 'warn', message,
suggestedValue? }`. The document's status is **derived** from the worst flag
present (`statusFromFlags`), and the whole rule set **re-runs on every field
edit** — so correcting a value flips its flag rail in place:

| Flags present | Status | Meaning |
| --- | --- | --- |
| ≥ 1 `error` | **Needs review** (red) | A hard violation; the document cannot be confirmed |
| only `warn`s | **Verify flagged** (amber) | Unusual but legitimate cases; look before signing off |
| none | **clean** (green) | Eligible to confirm |

`Confirmed` is always an explicit preparer action, never automatic. Editing a
confirmed document drops its confirmation — a confirmation attests to specific
values, so changing one invalidates it and requires re-confirmation.

Validation runs along two axes:

- **Internal** — cross-field arithmetic and consistency *within a single form*
  (e.g. Box 4 = 6.2% of Box 3; qualified dividends ≤ ordinary dividends).
- **External** — each value checked against *authoritative reference data*
  ([`lib/reference.ts`](lib/reference.ts)): SSA number structure, IRS EIN
  prefixes, the W-2 Box 12 code set, and USPS state codes. This is done with
  **encoded standards, not a network call** — a live check like IRS TIN matching
  would require sending a client's SSN off the machine, which would break the
  privacy posture. Encoding the standards keeps identifiers in the browser.

When a rule can compute the correct value (Box 4, Box 6), the flag carries a
`suggestedValue` and the field row shows a **one-click "Use computed value"**
button; edited fields also get a **revert-to-extracted** action.

### Value parsing

Before any rule runs, raw strings are normalized:

- **Money** — strip `$`, commas, spaces, parentheses, then parse. `"$62,400.00"`
  → `62400`. Unparseable → flagged.
- **SSN** — valid as `XXX-XX-XXXX` or 9 bare digits.
- **EIN / TIN** — valid as `XX-XXXXXXX` or 9 bare digits.

### Rules

**Format & presence (all forms)**

| Rule | Severity |
| --- | --- |
| SSN / EIN field doesn't match its pattern | error |
| Money field doesn't parse as a number | error |
| `tax_year` outside 1990–2100 | warn |
| A required field (TINs, primary income box) is empty | error |

**Confidence (all forms)**

| Rule | Severity |
| --- | --- |
| Un-edited, non-empty field with model confidence **< 0.8** | warn |

Edited fields are exempt — a preparer-typed value is trusted over the model's
self-reported score.

**External reference checks (all forms)** — value is well-formed but tested
against authoritative reference data. These are plausibility checks, so they
warn rather than block:

| Rule | Severity |
| --- | --- |
| **SSN structurally impossible** — area `000`/`666`/`900–999`, group `00`, or serial `0000` (never issued by the SSA) | warn |
| **EIN prefix not IRS-assigned** — first two digits outside the 83 valid prefixes | warn |
| **State code** not a valid USPS state/territory/military code | warn |
| **W-2 Box 12 code** outside the IRS set (A–HH; no I, O, U, X) | warn |

**W-2 internal arithmetic** — tolerance on each numeric check is the **greater of
±$2 or ±1%** of the expected value:

| Rule | Severity |
| --- | --- |
| **Box 4 ≈ 6.2% of (Box 3 + Box 7 tips)** (Social Security tax) | error if off — carries a computed suggested value |
| **Box 6 ≈ 1.45% of Box 5** (Medicare tax) | error if off — computed suggested value; **downgraded to warn** when Box 5 > $200,000 and Box 6 is above expected (likely the 0.9% Additional Medicare Tax) |
| **Box 3 + Box 7 ≤ SS wage base** for the tax year (2023 $160,200 · 2024 $168,600 · 2025 $176,100) | error if over; warn vs. the highest known base if the year is unknown |
| **Box 5 (Medicare wages) ≥ Box 3 (SS wages)** — Medicare is uncapped, so it's ≥ SS wages | warn if violated |
| **Box 2 < Box 1** (federal withholding below wages) | warn if violated |
| **Box 16 ≤ Box 1** (+ tolerance) | warn only — multi-state W-2s legitimately differ |
| **Box 17 < Box 16** (state tax below state wages) | warn if violated |
| **Box 19 < Box 18** (local tax below local wages) | warn if violated |

**1099-R**

| Rule | Severity |
| --- | --- |
| **Box 2a (taxable) ≤ Box 1 (gross distribution)** | error if violated |
| **Box 7 distribution code** in the valid IRS set (1–9, A, B, D, E, F, G, H, J, K, L, M, N, P, Q, R, S, T, U, W, incl. two-char combos like `7D`) | error otherwise |

**1099-DIV**

| Rule | Severity |
| --- | --- |
| **Box 1b (qualified) ≤ Box 1a (ordinary dividends)** — qualified is a subset of ordinary | error if violated |

**All 1099s**

| Rule | Severity |
| --- | --- |
| Federal withholding (Box 4) **> 50% of the largest income box** | warn |

**UNKNOWN documents** skip format/reference/arithmetic rules entirely (there is
no schema to check against); only the confidence warn applies, so they surface as
raw extraction for manual review rather than erroring.

### Why these thresholds

The rates (6.2%, 1.45%), wage bases, EIN prefixes, SSN structure, Box 12 and
distribution-code sets are the **actual SSA/IRS figures**, so the checks test
against reality rather than a heuristic. The `error`/`warn` split maps to "this
is definitely wrong — you can't export it" vs. "this is unusual — look before you
sign off," which is why only errors block confirmation while warnings sort to the
top of the review list. All of the above is covered by the unit tests in
[`lib/validate.test.ts`](lib/validate.test.ts) (`npm test`, 43 cases).

**Reference-data sources**

- SSN structure (area/group/serial rules, post-randomization): [SSA — SSN Randomization](https://www.ssa.gov/employer/randomization.html)
- Valid EIN prefixes by campus: [IRS — Valid EINs](https://www.irs.gov/businesses/small-businesses-self-employed/valid-eins)
- W-2 Box 12 codes: [IRS — General Instructions for Forms W-2 and W-3](https://www.irs.gov/instructions/iw2w3)
- 1099-DIV Box 1a/1b relationship: [IRS — Instructions for Form 1099-DIV](https://www.irs.gov/instructions/i1099div)

---

## Architecture

```
┌─────────────────────────────── BROWSER ───────────────────────────────┐
│                                                                        │
│  File(s)                                                               │
│    │                                                                   │
│    ▼                                                                   │
│  lib/ocr.ts ── PDF text layer (pdfjs) ─┐                               │
│             └─ raster + Tesseract  ────┴──►  OCR text + page previews  │
│    │                                              │                    │
│    │  (only text leaves the browser)              │ (images stay here) │
│    ▼                                              ▼                    │
│  POST /api/extract  ─────────────────►   Document viewer (previews)    │
│    │                                                                   │
│    │           ┌──────────────────────────────────────────────┐      │
│    │           │  useReducer state (lib/reducer.ts)            │       │
│    ▼           │   docs[]  ← EXTRACT_DONE                       │       │
│  extraction ──►│         │                                     │       │
│  result        │         ▼                                     │       │
│                │  lib/validate.ts (pure) ── flags ── rail color│       │
│                │         │                                     │       │
│                │         ▼   EDIT_FIELD → re-validate (live)   │       │
│                │  FieldPanel / FieldRow (flag rail)            │       │
│                └──────────────────────────────────────────────┘      │
│                          │                                             │
│                          ▼  CONFIRM                                    │
│                  lib/export.ts → CSV / JSON download                   │
└────────────────────────────────────────────────────────────────────────┘
                           │
                           ▼  (server, text only)
              ┌─────────────────────────────────┐
              │  app/api/extract/route.ts        │
              │   • builds prompt (lib/prompt.ts) │
              │   • calls Groq chat completions   │
              │   • strips fences, retries, normalizes
              │   • GROQ_API_KEY never leaves here │
              └─────────────────────────────────┘
                           │
                           ▼
                    Groq API (llama-3.3-70b-versatile)
```

**Key modules**

| File | Responsibility |
| --- | --- |
| `lib/ocr.ts` | Client OCR: PDF text layer → Tesseract fallback, page previews, progress |
| `lib/schemas.ts` | Typed field definitions per form type; stable CSV column order |
| `lib/validate.ts` | Pure, unit-testable validation engine (internal + external rules) |
| `lib/reference.ts` | Encoded SSA/IRS reference data for external validation |
| `lib/prompt.ts` | System + user prompt construction |
| `lib/reducer.ts` | All app state (`useReducer`); derives status from flags |
| `lib/export.ts` | CSV / JSON serialization + download |
| `app/api/extract/route.ts` | Server-side Groq call; the only place the key is used |
| `components/*` | Top bar, drop zone, queue, viewer, field panel + flag rail, bottom bar |

---

## Local setup (3 steps)

```bash
# 1. Install
npm install

# 2. Add your Groq key (get one at https://console.groq.com/keys)
cp .env.example .env.local
#   then edit .env.local and set GROQ_API_KEY=gsk_...
#   optional: set GEMINI_API_KEY=... for provider fallback

# 3. Run
npm run dev        # http://localhost:3000
```

Then click **Try sample documents** to run the bundled synthetic forms through
the real OCR → extraction pipeline, or drop in your own PDFs/PNGs/JPGs.

**Other scripts**

```bash
npm run build      # production build (zero type errors)
npm test           # validation unit tests (tsx)
npm run samples    # regenerate public/samples/*.png (only needed if edited)
```

---

## Deploy to Vercel

1. Push this repo to GitHub and **import it** at [vercel.com/new](https://vercel.com/new).
2. Under **Environment Variables**, set `GROQ_API_KEY` (and optionally
   `GROQ_MODEL`).
3. **Deploy.** No other configuration is required — the pdf.js worker is bundled
   via `new URL(...)` so it works on Vercel with no CDN setup.

---

## Privacy

- **Document images never leave your browser.** OCR runs entirely client-side.
  Only the extracted OCR *text* is sent to the server for AI extraction, so
  images containing SSNs and other identifiers stay on your machine.
- **Nothing is persisted server-side.** There is no database and no auth. All
  application state lives in React (`useReducer`) and is gone on reload. The
  Groq API key is read only in the server route and is never exposed to the
  client.
- The Groq API is the one external service the OCR text is sent to, for
  extraction. See Groq's own data-handling terms for how they treat API input.

---

## Notes & limitations

- Files over **15 MB** are rejected client-side to keep browser OCR responsive.
- Scanned-document accuracy depends on scan quality; low-confidence fields are
  flagged for verification regardless of whether they pass every rule.
- The Groq free tier is rate-limited; the extraction route auto-retries once on
  a 429, and any document that still fails lands in a "retry" state rather than
  crashing.
