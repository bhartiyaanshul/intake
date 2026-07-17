import type { DocStatus, FormType } from "@/lib/types";

// Status chip that live-updates as a document moves through the pipeline. Colors
// map to the ledger palette: red = needs review, amber = verify, green = ready
// / confirmed.

const STATUS_LABEL: Record<DocStatus, string> = {
  queued: "Queued",
  ocr: "OCR",
  extracting: "Extracting…",
  extract_failed: "Extraction failed",
  needs_review: "Needs review",
  verify_flagged: "Verify flagged",
  clean: "Ready to confirm",
  confirmed: "Confirmed",
};

function classesFor(status: DocStatus): string {
  switch (status) {
    case "needs_review":
    case "extract_failed":
      return "bg-[#f7e4e2] text-danger border-danger/30";
    case "verify_flagged":
      return "bg-[#f6ead6] text-amber border-amber/30";
    case "clean":
      return "bg-[#e2efe7] text-ledger border-ledger/30";
    case "confirmed":
      return "bg-ledger text-white border-ledger";
    case "ocr":
    case "extracting":
      return "bg-white text-ink/70 border-hairline";
    default:
      return "bg-[#eef0ec] text-ink/60 border-hairline";
  }
}

export function StatusChip({
  status,
  ocrProgress,
}: {
  status: DocStatus;
  ocrProgress?: number;
}) {
  let label = STATUS_LABEL[status];
  if (status === "ocr" && ocrProgress != null) {
    label = `OCR ${Math.round(ocrProgress)}%`;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${classesFor(
        status,
      )}`}
    >
      {(status === "ocr" || status === "extracting") && (
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}

export function FormTypeChip({ formType }: { formType: FormType }) {
  const unknown = formType === "UNKNOWN";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold tnum tracking-tight ${
        unknown
          ? "border-hairline bg-white text-ink/50"
          : "border-ink/15 bg-white text-ink"
      }`}
      title={unknown ? "Unrecognized — raw extraction" : formType}
    >
      {unknown ? "Unrecognized" : formType}
    </span>
  );
}
