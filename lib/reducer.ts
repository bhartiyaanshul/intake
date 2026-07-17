import { getSchema } from "./schemas";
import { statusFromFlags, validateDocument } from "./validate";
import type {
  DocStatus,
  ExtractedField,
  ExtractionResult,
  IntakeDoc,
  PageImage,
} from "./types";

// Central client state. All app state lives here (useReducer) — no database, no
// server-side persistence. Reload = clean slate. This is deliberate: tax
// documents never touch a server store. See README.

export interface State {
  docs: IntakeDoc[];
  selectedId: string | null;
}

export const initialState: State = { docs: [], selectedId: null };

export type Action =
  | { type: "ADD_DOCS"; docs: IntakeDoc[] }
  | { type: "SELECT_DOC"; id: string }
  | { type: "OCR_PROGRESS"; id: string; percent: number }
  | { type: "OCR_DONE"; id: string; text: string; pages: PageImage[] }
  | { type: "EXTRACT_START"; id: string }
  | { type: "EXTRACT_DONE"; id: string; result: ExtractionResult }
  | { type: "EXTRACT_FAILED"; id: string; error: string }
  | { type: "RETRY"; id: string }
  | { type: "EDIT_FIELD"; id: string; key: string; value: string }
  | { type: "CONFIRM"; id: string; at: number }
  | { type: "UNCONFIRM"; id: string }
  | { type: "REMOVE_DOC"; id: string };

// Build ExtractedField[] for a document from an extraction result. For known
// form types we lay fields out in schema order (so the review panel is stable);
// for UNKNOWN we surface whatever keys the model returned.
export function buildFields(result: ExtractionResult): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const schema = getSchema(result.formType);

  if (schema.length > 0) {
    for (const def of schema) {
      const got = result.fields[def.key];
      const value = got?.value ?? "";
      fields.push({
        key: def.key,
        value,
        originalValue: value,
        // Absent fields get confidence 1 so the (skipped-on-empty) confidence
        // rule never flags them; present fields keep the model's score.
        confidence: got ? got.confidence : 1,
        edited: false,
      });
    }
  } else {
    for (const [key, got] of Object.entries(result.fields)) {
      const value = got?.value ?? "";
      fields.push({
        key,
        value,
        originalValue: value,
        confidence: got?.confidence ?? 0.5,
        edited: false,
      });
    }
  }
  return fields;
}

// Recompute flags + derived status for a doc, preserving confirmation only if
// nothing has invalidated it (caller decides when to drop confirmation).
function revalidate(doc: IntakeDoc): IntakeDoc {
  const flags = validateDocument(doc.formType, doc.fields);
  const derived = statusFromFlags(flags);
  const status: DocStatus =
    doc.status === "confirmed" ? "confirmed" : derived;
  return { ...doc, flags, status };
}

function mapDoc(
  state: State,
  id: string,
  fn: (doc: IntakeDoc) => IntakeDoc,
): State {
  return {
    ...state,
    docs: state.docs.map((d) => (d.id === id ? fn(d) : d)),
  };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_DOCS": {
      const docs = [...state.docs, ...action.docs];
      const selectedId = state.selectedId ?? action.docs[0]?.id ?? null;
      return { docs, selectedId };
    }

    case "SELECT_DOC":
      return { ...state, selectedId: action.id };

    case "OCR_PROGRESS":
      return mapDoc(state, action.id, (d) => ({
        ...d,
        status: "ocr",
        ocrProgress: action.percent,
      }));

    case "OCR_DONE":
      return mapDoc(state, action.id, (d) => ({
        ...d,
        ocrText: action.text,
        pages: action.pages,
        ocrProgress: 100,
      }));

    case "EXTRACT_START":
      return mapDoc(state, action.id, (d) => ({
        ...d,
        status: "extracting",
        error: undefined,
      }));

    case "EXTRACT_DONE": {
      return mapDoc(state, action.id, (d) => {
        const fields = buildFields(action.result);
        const base: IntakeDoc = {
          ...d,
          formType: action.result.formType,
          fields,
          error: undefined,
          status: "clean", // placeholder, revalidate overwrites
        };
        return revalidate(base);
      });
    }

    case "EXTRACT_FAILED":
      return mapDoc(state, action.id, (d) => ({
        ...d,
        status: "extract_failed",
        error: action.error,
      }));

    case "RETRY":
      return mapDoc(state, action.id, (d) => ({
        ...d,
        status: d.ocrText ? "extracting" : "queued",
        error: undefined,
      }));

    case "EDIT_FIELD": {
      return mapDoc(state, action.id, (d) => {
        const fields = d.fields.map((f) =>
          f.key === action.key
            ? {
                ...f,
                value: action.value,
                edited: action.value !== f.originalValue,
              }
            : f,
        );
        // DECISION: editing a confirmed doc drops confirmation. A confirmation
        // attests to specific values; changing one invalidates that attestation,
        // so the preparer must re-confirm rather than silently exporting stale data.
        const wasConfirmed = d.status === "confirmed";
        const next: IntakeDoc = {
          ...d,
          fields,
          status: wasConfirmed ? "clean" : d.status,
          confirmedAt: wasConfirmed ? undefined : d.confirmedAt,
        };
        return revalidate(next);
      });
    }

    case "CONFIRM":
      return mapDoc(state, action.id, (d) => ({
        ...d,
        status: "confirmed",
        confirmedAt: action.at,
      }));

    case "UNCONFIRM":
      return mapDoc(state, action.id, (d) =>
        revalidate({ ...d, status: "clean", confirmedAt: undefined }),
      );

    case "REMOVE_DOC": {
      const docs = state.docs.filter((d) => d.id !== action.id);
      let selectedId = state.selectedId;
      if (selectedId === action.id) selectedId = docs[0]?.id ?? null;
      return { docs, selectedId };
    }

    default:
      return state;
  }
}
