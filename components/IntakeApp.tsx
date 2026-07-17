"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { initialState, reducer } from "@/lib/reducer";
import { runOcr, OcrError } from "@/lib/ocr";
import { Semaphore } from "@/lib/semaphore";
import { subscribeRules } from "@/lib/rules";
import type { ExtractionResult, IntakeDoc } from "@/lib/types";
import { TopBar } from "./TopBar";
import { DropZone } from "./DropZone";
import { DocumentQueue } from "./DocumentQueue";
import { ReviewWorkspace } from "./ReviewWorkspace";
import { BottomBar } from "./BottomBar";
import { validateBatch } from "@/lib/validate";
import { TourModal, hasSeenTour, markTourSeen } from "./TourModal";
import { redactSSNsInOcrText } from "@/lib/privacy";
import { RulesModal } from "./RulesModal";

// Bundled synthetic sample documents. The "Try sample documents" button fetches
// these and runs them through the real OCR → extraction pipeline — no faked
// results.
const SAMPLE_FILES = [
  "2025-w2-clean.png",
  "2025-w2-box4-review.png",
  "2025-1099-r-pension.png",
  "2025-1099-r-ira.png",
  "2025-1099-sa-hsa.png",
];

function newDoc(file: File): IntakeDoc {
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    fileSize: file.size,
    status: "queued",
    ocrProgress: 0,
    ocrText: "",
    pages: [],
    formType: "UNKNOWN",
    fields: [],
    flags: [],
  };
}

export function IntakeApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // Show the guided tour automatically on the first visit; afterwards it's
  // available on demand from the top bar. Persisted so it doesn't nag on reload.
  useEffect(() => {
    if (!hasSeenTour()) setTourOpen(true);
  }, []);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    markTourSeen();
  }, []);

  // When the preparer toggles validation rules, re-derive every document's flags
  // and status so the UI reflects the change immediately.
  useEffect(
    () => subscribeRules(() => dispatch({ type: "REVALIDATE_ALL" })),
    [],
  );

  // Normalize fields and refresh persisted in-memory flags after a hot reload
  // or updated validation rule, including newly accepted masked SSNs.
  useEffect(() => {
    dispatch({ type: "REVALIDATE_ALL" });
  }, []);

  // DECISION: free-tier Groq quotas are easily exhausted by parallel tax-form
  // prompts. OCR can continue concurrently, but extraction is intentionally
  // serialized so a batch does not turn one retry window into many failures.
  const groqGate = useRef(new Semaphore(1));
  // Keep original File objects so "retry" can re-run OCR if needed.
  const fileStore = useRef<Map<string, File>>(new Map());

  const runExtraction = useCallback(
    async (id: string, ocrText: string, fileName: string) => {
      dispatch({ type: "EXTRACT_START", id });
      const release = await groqGate.current.acquire();
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ocrText: redactSSNsInOcrText(ocrText), fileName }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          dispatch({
            type: "EXTRACT_FAILED",
            id,
            error: body.error ?? `Extraction failed (${res.status}).`,
          });
          return;
        }
        const result = (await res.json()) as ExtractionResult;
        dispatch({ type: "EXTRACT_DONE", id, result });
      } catch (err) {
        dispatch({
          type: "EXTRACT_FAILED",
          id,
          error:
            err instanceof Error
              ? err.message
              : "Network error reaching the extraction service.",
        });
      } finally {
        release();
      }
    },
    [],
  );

  const processFile = useCallback(
    async (id: string, file: File) => {
      try {
        const { text, pages } = await runOcr(file, (p) =>
          dispatch({ type: "OCR_PROGRESS", id, percent: p.percent }),
        );
        dispatch({ type: "OCR_DONE", id, text, pages });
        await runExtraction(id, text, file.name);
      } catch (err) {
        const msg =
          err instanceof OcrError
            ? err.message
            : err instanceof Error
              ? `OCR failed: ${err.message}`
              : "Could not read this file.";
        dispatch({ type: "EXTRACT_FAILED", id, error: msg });
      }
    },
    [runExtraction],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const docs = files.map((f) => {
        const doc = newDoc(f);
        fileStore.current.set(doc.id, f);
        return doc;
      });
      dispatch({ type: "ADD_DOCS", docs });
      // Kick off every pipeline concurrently; the Groq gate throttles the API leg.
      docs.forEach((doc) =>
        processFile(doc.id, fileStore.current.get(doc.id)!),
      );
    },
    [processFile],
  );

  const handleRetry = useCallback(
    (id: string) => {
      const doc = state.docs.find((d) => d.id === id);
      if (!doc) return;
      dispatch({ type: "RETRY", id });
      if (doc.ocrText) {
        runExtraction(id, doc.ocrText, doc.fileName);
      } else {
        const file = fileStore.current.get(id);
        if (file) processFile(id, file);
      }
    },
    [state.docs, runExtraction, processFile],
  );

  const loadSamples = useCallback(async () => {
    setLoadingSamples(true);
    try {
      const files = await Promise.all(
        SAMPLE_FILES.map(async (name) => {
          const res = await fetch(`/samples/${name}`);
          const blob = await res.blob();
          return new File([blob], name, { type: blob.type || "image/png" });
        }),
      );
      addFiles(files);
    } catch {
      // Non-fatal — user can still upload manually.
    } finally {
      setLoadingSamples(false);
    }
  }, [addFiles]);

  const selectDoc = useCallback((id: string) => {
    dispatch({ type: "SELECT_DOC", id });
    setDrawerOpen(false);
  }, []);

  const selected =
    state.docs.find((d) => d.id === state.selectedId) ?? null;
  const batchFlags = validateBatch(state.docs);

  // Empty state ---------------------------------------------------------------
  if (state.docs.length === 0) {
    return (
      <div className="flex h-dvh flex-col">
        <TopBar onOpenRules={() => setRulesOpen(true)} onOpenTour={() => setTourOpen(true)} />
        <TourModal open={tourOpen} onClose={closeTour} />
        <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
        <main className="flex-1 overflow-auto">
          <DropZone
            onFiles={addFiles}
            onTrySamples={loadSamples}
            loadingSamples={loadingSamples}
          />
        </main>
      </div>
    );
  }

  // Working state -------------------------------------------------------------
  return (
    <div className="flex h-dvh flex-col">
      <TopBar onOpenRules={() => setRulesOpen(true)} onOpenTour={() => setTourOpen(true)} />
      <TourModal open={tourOpen} onClose={closeTour} />
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <div className="flex min-h-0 flex-1">
        {/* sidebar — persistent on md+, drawer on mobile */}
        <div className="hidden md:block">
          <DocumentQueue
            docs={state.docs}
            selectedId={state.selectedId}
            onSelect={selectDoc}
            onFiles={addFiles}
            onRemove={(id) => dispatch({ type: "REMOVE_DOC", id })}
          />
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <div className="w-72 max-w-[80vw] bg-white shadow-xl">
              <DocumentQueue
                docs={state.docs}
                selectedId={state.selectedId}
                onSelect={selectDoc}
                onFiles={addFiles}
                onRemove={(id) => dispatch({ type: "REMOVE_DOC", id })}
              />
            </div>
            <div
              className="flex-1 bg-ink/30"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
          </div>
        )}

        {/* main workspace */}
        <main className="flex min-h-0 flex-1 flex-col">
          {/* mobile sub-header with queue toggle */}
          <div className="flex items-center gap-2 border-b border-hairline bg-white px-3 py-2 md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-md border border-hairline px-2 py-1 text-xs font-medium text-ink/70"
            >
              Documents ({state.docs.length})
            </button>
            <span className="truncate text-sm font-medium text-ink">
              {selected?.fileName ?? "Select a document"}
            </span>
          </div>

          <div className="min-h-0 flex-1">
            {selected ? (
              <ReviewWorkspace
                doc={selected}
                onEditField={(key, value) =>
                  dispatch({ type: "EDIT_FIELD", id: selected.id, key, value })
                }
                onConfirm={() =>
                  dispatch({
                    type: "CONFIRM",
                    id: selected.id,
                    at: Date.now(),
                  })
                }
                onUnconfirm={() =>
                  dispatch({ type: "UNCONFIRM", id: selected.id })
                }
                onRetry={() => handleRetry(selected.id)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink/45">
                Select a document from the queue.
              </div>
            )}
          </div>
        </main>
      </div>

      <BottomBar docs={state.docs} flags={batchFlags} onSelectDoc={selectDoc} />
    </div>
  );
}
