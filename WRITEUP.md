# Intake — Write-up

> Skeleton with factual build notes to edit into prose. Each bullet is a fact
> from the actual build; rework freely.

## What I built

- A Next.js 14 (App Router) + TypeScript + Tailwind app that takes tax documents
  from upload → client-side OCR → Groq extraction → live validation → preparer
  review/correction → confirm → CSV/JSON export.
- The whole thing is organized around the **review-and-verify workflow**, not the
  extraction: flagged fields sort to the top under "Needs your review," clean
  fields collapse, and each field carries a colored flag rail (green / amber /
  red) that updates in place the instant a value is edited and re-validated.
- Eight form types (W-2, 1099-NEC/-INT/-DIV/-R/-MISC, 1098) with typed schemas,
  plus an `UNKNOWN` fallback that does generic key/value extraction instead of
  erroring.
- A real validation engine (`lib/validate.ts`) that is pure and deterministic:
  W-2 SS/Medicare arithmetic with ±$2/±1% tolerance, SS wage-base checks by tax
  year, 1099-R taxable-amount and distribution-code rules, TIN formats,
  withholding sanity, required fields, and sub-0.8 confidence flags. Covered by
  28 passing unit tests.

## What I cut

- **No database and no auth** — state lives in React `useReducer` and is gone on
  reload. Deliberate for a tax-data tool: nothing is persisted server-side.
- **No vision-model extraction** — OCR text only, never document images, to the
  server (privacy; see decisions below).
- **No multi-user / job history / re-upload dedupe** — out of scope for a
  single-session preparer workflow.
- **Confidence is model-reported, not calibrated** — I flag `< 0.8` but didn't
  build a calibration layer or per-field OCR cross-check.

## Key decisions & tradeoffs

- **OCR-first + Groq text extraction over a vision model.** Sending OCR *text*
  (not page images) is cheaper (far fewer tokens than image inputs), faster on
  Groq's text models, and — most importantly — keeps SSN-bearing images in the
  browser. Tradeoff: extraction quality is capped by OCR quality, so garbled
  scans surface as low-confidence/validation flags rather than silent errors.
- **Client-side OCR (`pdfjs-dist` + `tesseract.js`).** Text-layer path first for
  digital PDFs (exact, instant); Tesseract fallback when a page yields < ~50
  chars (scanned). Keeps document images local and offloads OCR cost from the
  server. Tradeoff: first Tesseract run downloads the language model and is
  CPU-heavy, so OCR jobs are serialized through a mutex (a single worker can only
  process one job at a time, and its progress logger is global).
- **No DB.** Tax documents are sensitive and the workflow is session-scoped
  (prep a batch, export, done). Skipping persistence removes a whole class of
  data-handling/retention concerns and keeps deploy to one env var.
- **Deterministic validation as its own pure module.** The trust layer must be
  auditable and testable independent of the model; it re-runs live on every edit
  and is the source of truth for document status.
- **Concurrency: uploads process in parallel, Groq calls capped at 2** (client
  semaphore) to stay under rate limits; the route also auto-retries once on 429.
- **pdf.js worker bundled via `new URL(..., import.meta.url)`.** Works on Vercel
  with no CDN. Required a small webpack tweak: Next's Terser pass chokes on the
  ESM worker, so the emitted worker asset is flagged `minimized` before the
  optimize stage so Terser skips it. (See `next.config.mjs`.)

## AI stack

- **Groq**, model `llama-3.3-70b-versatile` (overridable via `GROQ_MODEL`),
  `response_format: json_object`, `temperature: 0` for deterministic transcription.
- Prompt instructs: classify the form, extract into the exact schema keys, return
  per-field confidence 0–1, return `null` for absent fields (no guessing), and
  transcribe values exactly as printed (no number reformatting). OCR text is
  fenced and labeled as untrusted data to transcribe, not instructions.
- Error handling: rate limits (429 → one auto-retry, then a graceful "retry"
  state), malformed JSON (strip code fences, retry parse once), and timeouts —
  the document never crashes the app.

## With more time

- Cross-check extracted values against their position in the OCR text / page
  image (bounding boxes) to drive a real, calibrated confidence rather than the
  model's self-report, and to let a preparer click a flag to jump to the value on
  the page.
- Per-field "accept extracted value" affordance and bulk-confirm across the queue.
- More form types (1095-A, 1099-B with per-lot detail, K-1) and multi-document
  clients (roll W-2 + 1099s into one client return).
- A thin, encrypted, opt-in persistence layer so a preparer can resume a batch,
  with explicit retention controls.
- Direct export adapters for specific tax software import formats.

## Assumptions

- The preparer is the trusted operator on their own machine; there's no
  adversarial multi-tenant concern within a session.
- US federal forms for recent tax years (SS wage bases are encoded for 2023–2025;
  unknown years degrade to warnings, not hard errors).
- A Groq API key is available at deploy time; without it the extraction route
  returns a clear setup error rather than failing silently.
- Sample documents are entirely synthetic (fictional names, 000-xx SSNs) and
  exist to exercise the real pipeline, including one W-2 with a deliberate Box 4
  error to demonstrate a red validation flag.
