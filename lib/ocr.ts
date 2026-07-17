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
import type { PageImage } from "./types";

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

async function ocrCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (p: number) => void,
): Promise<string> {
  const worker = await getTesseractWorker();
  const release = await ocrMutex.acquire();
  activeProgress = onProgress ?? null;
  try {
    const { data } = await worker.recognize(canvas);
    return (data.text as string) ?? "";
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
  const text = await ocrCanvas(canvas, (p) => {
    onProgress({
      percent: 10 + Math.round(p * 85),
      stage: `Running OCR (${Math.round(p * 100)}%)`,
    });
  });
  onProgress({ percent: 100, stage: "OCR complete" });
  return {
    text,
    pages: [{ dataUrl, width: canvas.width, height: canvas.height }],
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
    pages.push({
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    });

    if (layerText.length >= MIN_TEXT_LAYER_CHARS) {
      textParts.push(layerText);
    } else {
      // Scanned page — fall back to Tesseract on the rendered raster.
      onProgress({
        percent: Math.round(base + span * 0.15),
        stage: `Scanned page ${i}/${numPages} — running OCR`,
      });
      const ocrText = await ocrCanvas(canvas, (p) => {
        onProgress({
          percent: Math.round(base + span * (0.15 + p * 0.8)),
          stage: `OCR page ${i}/${numPages} (${Math.round(p * 100)}%)`,
        });
      });
      textParts.push(ocrText);
    }

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
