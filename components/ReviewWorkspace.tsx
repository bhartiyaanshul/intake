"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IntakeDoc, SourceMatch } from "@/lib/types";
import { getSchema } from "@/lib/schemas";
import { locateField } from "@/lib/provenance";
import { DocumentViewer } from "./DocumentViewer";
import {
  ExtractFailed,
  ExtractingSkeleton,
  FieldPanel,
} from "./FieldPanel";

// Main review workspace: source viewer (left) + editable field panel (right).
// On mobile the two panels stack vertically.
//
// This component owns click-to-source provenance state: when the preparer
// locates a field, we fuzzy-match its value against the page's OCR geometry
// (lib/provenance) and hand the resulting region to the viewer to highlight.

interface Located {
  key: string;
  match: SourceMatch | null; // null → matched nothing on the page
  nonce: number; // bumps every click so re-locating the same field re-pulses
}

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

  const [located, setLocated] = useState<Located | null>(null);

  // Clear the highlight when switching documents.
  useEffect(() => setLocated(null), [doc.id]);

  const canLocate = useMemo(
    () => doc.pages.some((p) => (p.words?.length ?? 0) > 0),
    [doc.pages],
  );

  const handleLocate = useCallback(
    (key: string) => {
      const field = doc.fields.find((f) => f.key === key);
      if (!field) return;
      const def = getSchema(doc.formType).find((d) => d.key === key);
      const match = locateField(doc.pages, field.value, def?.type ?? "text");
      setLocated((prev) => ({
        key,
        match,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
    },
    [doc.fields, doc.pages, doc.formType],
  );

  return (
    <div className="grid h-full grid-rows-2 md:grid-cols-2 md:grid-rows-1">
      <div className="min-h-0 border-b border-hairline md:border-b-0 md:border-r">
        <DocumentViewer doc={doc} highlight={located?.match ?? null} />
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
            canLocate={canLocate}
            onLocate={handleLocate}
            locatedKey={located?.key ?? null}
            locatedFound={located?.match != null}
          />
        )}
      </div>
    </div>
  );
}
