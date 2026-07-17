"use client";

import { useEffect, useRef, useState } from "react";
import type { IntakeDoc, SourceMatch } from "@/lib/types";

// Source document viewer: rendered page image with zoom in/out and prev/next
// page navigation for multi-page PDFs. When a field is located (click-to-source
// provenance), the matched region is overlaid on the page, the viewer jumps to
// its page, and it scrolls into view with a brief pulse.

export function DocumentViewer({
  doc,
  highlight,
}: {
  doc: IntakeDoc;
  highlight?: SourceMatch | null;
}) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Reset paging/zoom when switching documents.
  useEffect(() => {
    setPage(0);
    setZoom(1);
  }, [doc.id]);

  // Follow a new highlight: jump to its page, then scroll the box into view.
  useEffect(() => {
    if (!highlight) return;
    setPage(Math.min(highlight.page, Math.max(0, doc.pages.length - 1)));
  }, [highlight, doc.pages.length]);

  useEffect(() => {
    if (!highlight || highlight.page !== page) return;
    // Wait a frame so the overlay is laid out before scrolling to it.
    const id = requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [highlight, page]);

  const pages = doc.pages;
  const hasPages = pages.length > 0;
  const current = hasPages ? pages[Math.min(page, pages.length - 1)] : null;
  const showHighlight = highlight && highlight.page === page;

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

      <div ref={scrollRef} className="scroll-thin flex-1 overflow-auto p-4">
        {current ? (
          <div
            className="relative mx-auto border border-hairline bg-white shadow-sm"
            style={{ width: `${current.width * 0.5 * zoom}px` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.dataUrl}
              alt={`${doc.fileName} — page ${page + 1}`}
              className="block w-full"
              style={{ maxWidth: "none" }}
            />
            {showHighlight &&
              highlight.rects.map((r, i) => (
                <div
                  key={i}
                  ref={i === 0 ? highlightRef : undefined}
                  className="source-highlight pointer-events-none absolute rounded-[2px]"
                  style={{
                    left: `${r.x0 * 100}%`,
                    top: `${r.y0 * 100}%`,
                    width: `${(r.x1 - r.x0) * 100}%`,
                    height: `${(r.y1 - r.y0) * 100}%`,
                  }}
                />
              ))}
          </div>
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
