"use client";

import { useEffect, useState } from "react";

const TOUR_SEEN_KEY = "intake.tourSeen.v1";

export function markTourSeen() {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    /* ignore private-mode / quota errors */
  }
}

export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

interface Step {
  label: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  detail: React.ReactNode;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const STEPS: Step[] = [
  {
    label: "Getting started",
    title: "Turn source documents into review-ready data.",
    description: "A short overview of the workflow. You can reopen this any time from the top bar.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M5 3h11l3 3v15H5z" /><path d="M8 10h8M8 14h8M8 18h5" /></svg>,
    detail: (
      <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["1", "Upload"],
            ["2", "Extract"],
            ["3", "Review"],
            ["4", "Export"],
          ].map(([number, label]) => (
            <div key={label} className="rounded-lg border border-hairline bg-white px-3 py-2.5">
              <span className="text-xs font-semibold text-ledger">{number}</span>
              <p className="mt-0.5 text-sm font-medium text-ink">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-6 text-ink/65">
          Documents are read in the browser. You stay in control of the extracted fields before anything is exported.
        </p>
      </>
    ),
  },
  {
    label: "Upload",
    title: "Start with the original source forms.",
    description: "Drop PDFs or images into the workspace, or use the sample batch to explore the complete flow.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M12 15V4m0 0L8 8m4-4 4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>,
    detail: (
      <div className="rounded-lg border border-hairline bg-white p-4">
        <p className="text-sm font-medium text-ink">Supported source documents</p>
        <p className="mt-1.5 text-sm leading-6 text-ink/65">
          W-2s, 1099s, 1098s, K-1s, SSA-1099s, and charitable receipts. Add a full batch at once; each file appears separately in the queue.
        </p>
        <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-3 text-xs text-ink/55">
          <span className="h-1.5 w-1.5 rounded-full bg-ledger" /> PDF, PNG, or JPG · 15 MB per file
        </div>
      </div>
    ),
  },
  {
    label: "Review",
    title: "Verify fields alongside the source.",
    description: "The document stays on the left while the editable extraction is on the right.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M3 4h8v16H3zM13 4h8v16h-8z" /></svg>,
    detail: (
      <div className="grid auto-rows-fr gap-2 sm:grid-cols-3">
        {[
          ["Clean", "Checks passed", "bg-ledger"],
          ["Verify", "Needs a look", "bg-amber"],
          ["Resolve", "Blocks confirmation", "bg-danger"],
        ].map(([label, hint, color]) => (
          <div key={label} className="flex min-h-36 h-full flex-col rounded-lg border border-hairline bg-white p-3">
            <span className={`block h-1 w-6 rounded-full ${color}`} />
            <p className="mt-2 text-sm font-medium text-ink">{label}</p>
            <p className="mt-0.5 text-xs text-ink/55">{hint}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    label: "Validate",
    title: "Focus attention where it matters.",
    description: "Flags identify values that deserve confirmation, not just a generic confidence score.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="8" /><path d="M9 12l2 2 4-4" /></svg>,
    detail: (
      <div className="space-y-3 rounded-lg border border-hairline bg-white p-4 text-sm leading-6 text-ink/70">
        <p><b className="text-ink">Click to source</b> highlights the exact place a value was read from on the scanned page.</p>
        <p><b className="text-ink">Rules</b> catch missing fields, invalid TIN formats, arithmetic mismatches, and cross-document issues. Correct a value and the status updates immediately.</p>
      </div>
    ),
  },
  {
    label: "Finish",
    title: "Confirm only what you are ready to export.",
    description: "Once every blocking issue is resolved, confirm the document and export the reviewed data.",
    icon: <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}><path d="M4 4h11l5 5v11H4z" /><path d="M8 13l3 3 5-6" /></svg>,
    detail: (
      <div className="rounded-lg border border-ledger/20 bg-[#eaf3ed] p-4">
        <p className="text-sm font-semibold text-ink">Your audit trail stays with the export.</p>
        <p className="mt-1.5 text-sm leading-6 text-ink/70">CSV and JSON include extracted values, edits, confidence, and validation results. Editing a confirmed document reopens it for review.</p>
      </div>
    ),
  },
];

export function TourModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") setStep((current) => Math.min(STEPS.length - 1, current + 1));
      else if (event.key === "ArrowLeft") setStep((current) => Math.max(0, current - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      onClick={onClose}
    >
      <section
        className="flex h-[min(540px,calc(100dvh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-[0_24px_64px_rgba(21,33,27,0.24)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between px-6 pb-2 pt-6 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf3ed] text-ledger">
              {current.icon}
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ledger">{current.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-lg p-2 text-ink/45 transition-colors hover:bg-[#f1f3ef] hover:text-ink"
            aria-label="Close tour"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-3 sm:px-7">
          <h1 id="tour-title" className="max-w-lg text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{current.title}</h1>
          <p className="mt-2 max-w-lg text-[15px] leading-6 text-ink/60">{current.description}</p>
          <div className="mt-5 rounded-xl bg-[#f6f7f4] p-3.5 sm:p-4">{current.detail}</div>
        </div>

        <footer className="flex items-center justify-between border-t border-hairline px-6 py-3.5 sm:px-7">
          <div className="flex items-center gap-3">
            {isFirst ? (
              <button type="button" onClick={onClose} className="text-sm font-medium text-ink/55 transition-colors hover:text-ink">Skip</button>
            ) : (
              <button type="button" onClick={() => setStep((currentStep) => currentStep - 1)} className="text-sm font-medium text-ink/65 transition-colors hover:text-ledger">Back</button>
            )}
            <span className="text-xs text-ink/45">{step + 1} of {STEPS.length}</span>
          </div>
          <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((item, index) => (
              <button key={item.label} type="button" onClick={() => setStep(index)} aria-label={`Go to ${item.label}`} className={`h-1.5 rounded-full transition-all ${index === step ? "w-5 bg-ledger" : "w-1.5 bg-ink/20 hover:bg-ink/40"}`} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => isLast ? onClose() : setStep((currentStep) => currentStep + 1)}
            className="rounded-lg bg-ledger px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#195c3d]"
          >
            {isLast ? "Start extracting" : "Continue"}
          </button>
        </footer>
      </section>
    </div>
  );
}
