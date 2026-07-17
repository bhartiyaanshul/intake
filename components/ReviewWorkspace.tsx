"use client";

import type { IntakeDoc } from "@/lib/types";
import { DocumentViewer } from "./DocumentViewer";
import {
  ExtractFailed,
  ExtractingSkeleton,
  FieldPanel,
} from "./FieldPanel";

// Main review workspace: source viewer (left) + editable field panel (right).
// On mobile the two panels stack vertically.

export function ReviewWorkspace({
  doc,
  onEditField,
  onConfirm,
  onUnconfirm,
  onRetry,
}: {
  doc: IntakeDoc;
  onEditField: (key: string, value: string) => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
  onRetry: () => void;
}) {
  const busy =
    doc.status === "queued" ||
    doc.status === "ocr" ||
    doc.status === "extracting";

  return (
    <div className="grid h-full grid-rows-2 md:grid-cols-2 md:grid-rows-1">
      <div className="min-h-0 border-b border-hairline md:border-b-0 md:border-r">
        <DocumentViewer doc={doc} />
      </div>
      <div className="min-h-0">
        {doc.status === "extract_failed" ? (
          <ExtractFailed error={doc.error} onRetry={onRetry} />
        ) : busy ? (
          <ExtractingSkeleton />
        ) : (
          <FieldPanel
            doc={doc}
            onEditField={onEditField}
            onConfirm={onConfirm}
            onUnconfirm={onUnconfirm}
          />
        )}
      </div>
    </div>
  );
}
