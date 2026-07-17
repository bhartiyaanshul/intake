// Client-side OCR. Runs entirely in the browser so that documents containing
// SSNs never leave the machine as images — only the extracted OCR *text* is
// sent to the server for AI extraction. This is a genuine privacy posture for
// tax data, not a shortcut: raw pixels stay local.
//
// Two paths:
//   - Digital PDFs: pull the embedded text layer with pdfjs-dist (fast, exact).
//   - Scanned PDFs / images: rasterize to a canvas and run tesseract.js.
// We always try the PDF text layer first; if a page yields fewer than ~50
// characters we treat it as scanned and fall back to Tesseract for that page.
//
// pdfjs and tesseract are dynamically imported so they only load in the browser
// and never end up in the server bundle.

import { Semaphore } from "./semaphore";
import type { PageImage, WordBox } from "./types";

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
// DECISION: 50 chars is the text-layer-vs-scanned threshold. A born-digital PDF
// page yields hundreds of chars from its text layer; a scanned page yields ~0.
// 50 cleanly separates the two while tolerating near-empty digital pages.
const MIN_TEXT_LAYER_CHARS = 50; // below this, treat a PDF page as scanned
const PREVIEW_SCALE = 2.0; // render scale for page previews / OCR raster

export interface OcrProgress {
  // 0..100 overall progress for the document.
  percent: number;
  // Human-readable stage, e.g. "Reading text layer" / "OCR page 2/3 (57%)".
  stage: string;
}

export interface OcrResult {
  text: string;
  pages: PageImage[];
}

export class OcrError extends Error {}

function fileExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function isImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return ["png", "jpg", "jpeg", "webp", "bmp", "gif"].includes(
    fileExt(file.name),
  );
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || fileExt(file.name) === "pdf";
}

// Lazily-created shared Tesseract worker. Reused across pages/documents so we
// don't pay worker startup + language download on every page.
//
// A single worker can only run one recognize() job at a time, and its logger is
// registered once at creation — so concurrent jobs would both corrupt each
// other's state and cross their progress reporting. We therefore serialize all
// recognize() calls through a 1-slot mutex and route progress to whichever job
// currently holds it via `activeProgress`. Documents still upload/OCR "in
// parallel" from the user's perspective; the CPU-bound recognize step is simply
// queued, which is what a single worker does anyway.
let tesseractWorkerPromise: Promise<any> | null = null;
let activeProgress: ((p: number) => void) | null = null;
const ocrMutex = new Semaphore(1);

async function getTesseractWorker(): Promise<any> {
  const Tesseract = await import("tesseract.js");
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = Tesseract.createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text" && activeProgress) {
          activeProgress(m.progress);
        }
      },
    });
  }
  return tesseractWorkerPromise;
}

interface OcrCanvasResult {
  text: string;
  words: WordBox[];
}

// Pull per-word geometry out of Tesseract's block tree. Tesseract reports pixel
// bboxes in the coordinate space of the canvas we handed it; we normalize by the
// canvas dimensions so the boxes survive any later display scaling.
function wordsFromTesseract(data: any, w: number, h: number): WordBox[] {
  const out: WordBox[] = [];
  const collect = (word: any) => {
    const b = word?.bbox;
    const text = (word?.text ?? "").trim();
    if (!b || !text) return;
    if (w <= 0 || h <= 0) return;
    out.push({
      text,
      x0: b.x0 / w,
      y0: b.y0 / h,
      x1: b.x1 / w,
      y1: b.y1 / h,
    });
  };
  // v5 exposes words under blocks → paragraphs → lines → words. Fall back to a
  // flat data.words array if a build provides one.
  if (Array.isArray(data?.blocks)) {
    for (const block of data.blocks) {
      for (const para of block?.paragraphs ?? []) {
        for (const line of para?.lines ?? []) {
          for (const word of line?.words ?? []) collect(word);
        }
      }
    }
  } else if (Array.isArray(data?.words)) {
    for (const word of data.words) collect(word);
  }
  return out;
}

async function ocrCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (p: number) => void,
): Promise<OcrCanvasResult> {
  const worker = await getTesseractWorker();
  const release = await ocrMutex.acquire();
  activeProgress = onProgress ?? null;
  try {
    // Request the block tree so we get word geometry, not just plain text.
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    return {
      text: (data.text as string) ?? "",
      words: wordsFromTesseract(data, canvas.width, canvas.height),
    };
  } finally {
    activeProgress = null;
    release();
  }
}

// --- image path -------------------------------------------------------------

async function loadImageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new OcrError("Could not read image file."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new OcrError("Canvas not available in this browser.");
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function processImage(
  file: File,
  onProgress: (p: OcrProgress) => void,
): Promise<OcrResult> {
  onProgress({ percent: 5, stage: "Rasterizing image" });
  const canvas = await loadImageToCanvas(file);
  const dataUrl = canvas.toDataURL("image/png");
  onProgress({ percent: 10, stage: "Running OCR" });
  const { text, words } = await ocrCanvas(canvas, (p) => {
    onProgress({
      percent: 10 + Math.round(p * 85),
      stage: `Running OCR (${Math.round(p * 100)}%)`,
    });
  });
  onProgress({ percent: 100, stage: "OCR complete" });
  return {
    text,
    pages: [{ dataUrl, width: canvas.width, height: canvas.height, words }],
  };
}

// --- pdf path ---------------------------------------------------------------

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  // Bundle the worker via import.meta.url so it works on Vercel with no CDN.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs;
}

// Derive per-word boxes from a single pdf.js text item. An item is a run of
// glyphs sharing one transform; its `transform` matrix places the baseline start
// in PDF user space, and `width`/`height` are in unscaled PDF units. We compose
// with the viewport transform to land in device (canvas) pixels, then split the
// run's own text into whitespace words, apportioning the run width by character
// count so each word gets its own tight box. Coordinates are normalized 0..1.
function wordsFromTextItem(
  pdfjs: any,
  item: any,
  viewport: { transform: number[]; width: number; height: number; scale: number },
): WordBox[] {
  const str: string = item.str ?? "";
  if (!str.trim()) return [];
  const vw = viewport.width;
  const vh = viewport.height;
  if (vw <= 0 || vh <= 0) return [];

  const tx = pdfjs.Util.transform(viewport.transform, item.transform);
  const left = tx[4];
  const fontHeight = Math.hypot(tx[2], tx[3]);
  const baseline = tx[5];
  const top = baseline - fontHeight;
  const runWidth = (item.width ?? 0) * viewport.scale;
  if (runWidth <= 0 || fontHeight <= 0) return [];

  const y0 = top / vh;
  const y1 = (top + fontHeight) / vh;
  const perChar = runWidth / str.length; // width of one character in device px

  const out: WordBox[] = [];
  // Walk the run, tracking character offset so each word's x-range tracks its
  // position within the run (this is what keeps a value inside "Wages 62,400.00"
  // from lighting up the whole line).
  const wordRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(str)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const x0 = (left + start * perChar) / vw;
    const x1 = (left + end * perChar) / vw;
    out.push({ text: m[0], x0, y0, x1, y1 });
  }
  return out;
}

async function processPdf(
  file: File,
  onProgress: (p: OcrProgress) => void,
): Promise<OcrResult> {
  onProgress({ percent: 3, stage: "Opening PDF" });
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const numPages = doc.numPages;

  const pages: PageImage[] = [];
  const textParts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const base = ((i - 1) / numPages) * 100;
    const span = (1 / numPages) * 100;
    onProgress({
      percent: Math.round(base + span * 0.1),
      stage: `Reading page ${i}/${numPages}`,
    });

    const page = await doc.getPage(i);

    // 1. Try the embedded text layer.
    const content = await page.getTextContent();
    const layerText = content.items
      .map((it: any) => ("str" in it ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // 2. Always render a preview raster (also reused for OCR fallback).
    const viewport = page.getViewport({ scale: PREVIEW_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new OcrError("Canvas not available in this browser.");
    await page.render({ canvasContext: ctx, viewport }).promise;

    let words: WordBox[];
    if (layerText.length >= MIN_TEXT_LAYER_CHARS) {
      // Text-layer path: derive word geometry from the same items we read text
      // from, so provenance highlights are exact (no re-OCR of a digital page).
      words = content.items.flatMap((it: any) =>
        "str" in it ? wordsFromTextItem(pdfjs, it, viewport) : [],
      );
      textParts.push(layerText);
    } else {
      // Scanned page — fall back to Tesseract on the rendered raster.
      onProgress({
        percent: Math.round(base + span * 0.15),
        stage: `Scanned page ${i}/${numPages} — running OCR`,
      });
      const result = await ocrCanvas(canvas, (p) => {
        onProgress({
          percent: Math.round(base + span * (0.15 + p * 0.8)),
          stage: `OCR page ${i}/${numPages} (${Math.round(p * 100)}%)`,
        });
      });
      textParts.push(result.text);
      words = result.words;
    }

    pages.push({
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      words,
    });

    onProgress({
      percent: Math.round(base + span),
      stage: `Page ${i}/${numPages} done`,
    });
  }

  onProgress({ percent: 100, stage: "OCR complete" });
  return { text: textParts.join("\n\n---- page break ----\n\n"), pages };
}

// --- entry point ------------------------------------------------------------

export async function runOcr(
  file: File,
  onProgress: (p: OcrProgress) => void,
): Promise<OcrResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new OcrError(
      `File is ${(file.size / 1024 / 1024).toFixed(
        1,
      )} MB — the 15 MB limit keeps browser OCR responsive. Split or compress it.`,
    );
  }
  if (isPdf(file)) return processPdf(file, onProgress);
  if (isImage(file)) return processImage(file, onProgress);
  throw new OcrError(
    `Unsupported file type "${file.name}". Upload a PDF, PNG, or JPG.`,
  );
}
