"use client";

import { useCallback, useRef, useState } from "react";

// Centered drop zone for the empty state, plus a compact variant reused in the
// sidebar for adding more documents once the queue is populated.

const ACCEPT = ".pdf,.png,.jpg,.jpeg,image/*,application/pdf";

export function DropZone({
  onFiles,
  onTrySamples,
  loadingSamples,
}: {
  onFiles: (files: File[]) => void;
  onTrySamples: () => void;
  loadingSamples: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 py-16">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`flex w-full cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-8 py-16 text-center transition-colors ${
          dragging
            ? "border-ledger bg-[#e2efe7]"
            : "border-hairline bg-white hover:border-ledger/50"
        }`}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e2efe7] text-ledger">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-base font-semibold text-ink">
          Drop W-2s, 1099s, or 1098s
        </p>
        <p className="mt-1 text-sm text-ink/60">
          PDF, PNG, or JPG · up to 15 MB each · click to browse
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFiles(files);
            e.target.value = "";
          }}
        />
      </div>

      <p className="mt-4 max-w-md text-center text-xs leading-relaxed text-ink/50">
        Documents are OCR&rsquo;d in your browser; only the extracted text is
        sent for AI extraction. Images with SSNs never leave your machine.
      </p>

      <button
        onClick={onTrySamples}
        disabled={loadingSamples}
        className="mt-6 rounded-md border border-ledger/40 bg-white px-4 py-2 text-sm font-medium text-ledger transition-colors hover:bg-[#e2efe7] disabled:opacity-60"
      >
        {loadingSamples ? "Loading samples…" : "Try sample documents"}
      </button>
    </div>
  );
}

// Compact add-files button used in the sidebar footer.
export function AddFilesButton({
  onFiles,
}: {
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-md border border-hairline bg-white px-3 py-2 text-sm font-medium text-ink/80 transition-colors hover:border-ledger/50 hover:text-ledger"
      >
        + Add documents
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </>
  );
}
