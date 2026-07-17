"use client";

import { useEffect, useState } from "react";
import type { IntakeDoc } from "@/lib/types";

// Source document viewer: rendered page image with zoom in/out and prev/next
// page navigation for multi-page PDFs.

export function DocumentViewer({ doc }: { doc: IntakeDoc }) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);

  // Reset paging/zoom when switching documents.
  useEffect(() => {
    setPage(0);
    setZoom(1);
  }, [doc.id]);

  const pages = doc.pages;
  const hasPages = pages.length > 0;
  const current = hasPages ? pages[Math.min(page, pages.length - 1)] : null;

  return (
    <div className="flex h-full flex-col bg-[#eceee9]">
      <div className="flex items-center justify-between border-b border-hairline bg-white px-3 py-2">
        <span className="text-xs font-medium text-ink/60">Source document</span>
        <div className="flex items-center gap-1">
          {pages.length > 1 && (
            <div className="mr-2 flex items-center gap-1 text-xs text-ink/70">
              <ViewerBtn
                label="Previous page"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ‹
              </ViewerBtn>
              <span className="tnum w-14 text-center">
                {page + 1} / {pages.length}
              </span>
              <ViewerBtn
                label="Next page"
                onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
                disabled={page >= pages.length - 1}
              >
                ›
              </ViewerBtn>
            </div>
          )}
          <ViewerBtn
            label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            disabled={zoom <= 0.5}
          >
            −
          </ViewerBtn>
          <span className="tnum w-12 text-center text-xs text-ink/70">
            {Math.round(zoom * 100)}%
          </span>
          <ViewerBtn
            label="Zoom in"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            disabled={zoom >= 3}
          >
            +
          </ViewerBtn>
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-auto p-4">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.dataUrl}
            alt={`${doc.fileName} — page ${page + 1}`}
            className="mx-auto border border-hairline bg-white shadow-sm"
            style={{ width: `${current.width * 0.5 * zoom}px`, maxWidth: "none" }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-center text-sm text-ink/40">
            {doc.status === "ocr" || doc.status === "queued"
              ? "Rendering page preview…"
              : "No preview available for this document."}
          </div>
        )}
      </div>
    </div>
  );
}

function ViewerBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded border border-hairline bg-white text-ink/70 transition hover:border-ledger/50 hover:text-ledger disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
