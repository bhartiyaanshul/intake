"use client";

import { useEffect, useState } from "react";

export function WelcomeModal() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-hairline bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-hairline px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ledger">
              Intake review workspace
            </p>
            <h1 id="welcome-title" className="mt-1 text-xl font-semibold text-ink">
              Extract quickly. Verify deliberately.
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-ink/45 hover:bg-[#f1f3ef] hover:text-ink"
            aria-label="Close overview"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="divide-y divide-hairline">
          <section className="px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">How validation works</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="border-l-[3px] border-danger pl-3">
                <p className="text-xs font-semibold text-ink">Internal checks</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/65">
                  Each form is checked for required fields, TIN formats, confidence, arithmetic, limits, and box-to-box consistency. Red findings block confirmation; amber findings ask for review.
                </p>
              </div>
              <div className="border-l-[3px] border-amber pl-3">
                <p className="text-xs font-semibold text-ink">Cross-document checks</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/65">
                  The batch is compared by taxpayer TIN for duplicate forms, excess Social Security withholding, mixed years, identity differences, withholding sanity, and multi-state activity.
                </p>
              </div>
            </div>
          </section>

          <section className="px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Privacy by design</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink/65">
              OCR runs in your browser. Document images, including those containing SSNs, stay on your device. Extracted OCR text is sent to Groq for classification and transcription, and only if Groq fails, to Gemini when the optional fallback key is configured. Intake does not persist client documents in a server-side database.
            </p>
          </section>

          <section className="px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Review workflow</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink/65">
              Upload forms, review the flag rail first, correct values in place, then explicitly confirm documents before export. CSV and JSON exports preserve the extracted value, edits, confidence, and validation audit trail.
            </p>
          </section>
        </div>

        <div className="flex justify-end border-t border-hairline bg-[#f1f3ef] px-5 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md bg-ledger px-4 py-2 text-sm font-medium text-white hover:bg-[#195c3d]"
          >
            Start reviewing
          </button>
        </div>
      </div>
    </div>
  );
}
