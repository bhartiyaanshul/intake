// Shared domain types for the Intake pipeline.

export type FormType =
  | "W-2"
  | "1099-NEC"
  | "1099-INT"
  | "1099-DIV"
  | "1099-R"
  | "1099-MISC"
  | "1098"
  | "UNKNOWN";

export type FieldType =
  | "text"
  | "money"
  | "ssn"
  | "ein"
  | "state"
  | "code"
  | "year";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

// One extracted field, carrying the model's value + confidence, the preparer's
// correction (if any), and the original extracted value for the audit trail.
export interface ExtractedField {
  key: string;
  value: string; // current value (preparer-corrected if edited)
  originalValue: string; // model's original transcription — never mutated after extraction
  confidence: number; // 0..1, from the model
  edited: boolean;
}

export type Severity = "error" | "warn";

export interface ValidationFlag {
  fieldKey: string;
  severity: Severity;
  message: string;
  // When a rule can compute the correct value (e.g. Box 4 = 6.2% of Box 3), it
  // supplies it here so the UI can offer a one-click fix.
  suggestedValue?: string;
}

// Result the /api/extract route returns.
export interface ExtractionResult {
  formType: FormType;
  fields: Record<string, { value: string | null; confidence: number }>;
  // For UNKNOWN docs the model returns arbitrary key/value pairs; those are
  // surfaced under `fields` too, with the schema built dynamically.
}

// Lifecycle of a document as it moves through the pipeline.
export type DocStatus =
  | "queued"
  | "ocr" // running OCR (progress in ocrProgress)
  | "extracting"
  | "extract_failed"
  | "needs_review" // has at least one error flag
  | "verify_flagged" // only warn flags
  | "clean" // no flags
  | "confirmed";

export interface PageImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface IntakeDoc {
  id: string;
  fileName: string;
  fileSize: number;
  status: DocStatus;
  ocrProgress: number; // 0..100
  ocrText: string;
  pages: PageImage[]; // rendered page previews
  formType: FormType;
  fields: ExtractedField[];
  flags: ValidationFlag[];
  error?: string; // populated in extract_failed state
  confirmedAt?: number;
}
