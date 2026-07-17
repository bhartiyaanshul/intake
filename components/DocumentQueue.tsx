"use client";

import type { IntakeDoc } from "@/lib/types";
import { AddFilesButton } from "./DropZone";
import { FormTypeChip, StatusChip } from "./StatusChip";

// Left sidebar: the document queue. Each row shows filename, detected form-type
// chip, and a live-updating status chip.

export function DocumentQueue({
  docs,
  selectedId,
  onSelect,
  onFiles,
  onRemove,
}: {
  docs: IntakeDoc[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-hairline bg-white/60 md:w-72 lg:w-80">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">
          Documents
          <span className="ml-1.5 tnum text-ink/40">{docs.length}</span>
        </h2>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        <ul className="divide-y divide-hairline">
          {docs.map((doc) => {
            const active = doc.id === selectedId;
            return (
              <li key={doc.id}>
                <button
                  onClick={() => onSelect(doc.id)}
                  className={`group flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors ${
                    active ? "bg-[#eef2ee]" : "hover:bg-[#f1f3ef]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="truncate text-sm font-medium text-ink"
                      title={doc.fileName}
                    >
                      {doc.fileName}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(doc.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemove(doc.id);
                        }
                      }}
                      className="shrink-0 rounded p-0.5 text-ink/30 opacity-0 transition hover:text-danger group-hover:opacity-100"
                      title="Remove"
                      aria-label={`Remove ${doc.fileName}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6 6l12 12M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FormTypeChip formType={doc.formType} variant={doc.variant} />
                    <StatusChip status={doc.status} ocrProgress={doc.ocrProgress} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-hairline p-3">
        <AddFilesButton onFiles={onFiles} />
      </div>
    </aside>
  );
}
