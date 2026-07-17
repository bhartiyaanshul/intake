// Privacy helpers keep full Social Security numbers out of review state,
// exports, and provider prompts while preserving the last four digits needed
// for preparer matching and review.

export function maskSSN(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  // A full nine-digit SSN (typed or extracted) → keep only the last four.
  if (digits.length === 9) return `***-**-${digits.slice(-4)}`;
  // An already-masked value. Source forms mask SSNs with * or X and any
  // separator (-, _, ., space, or none): "***-**-1234", "XXX_XX_6789",
  // "***.**.****". Normalize to our canonical form.
  if (/[*Xx]/.test(trimmed)) {
    // Recover the last four if the mask still exposes them.
    if (digits.length === 4) return `***-**-${digits}`;
    // Fully masked with nothing to recover (e.g. "***_***_***").
    if (digits.length === 0) return "***-**-****";
  }
  return value;
}

// Accepts our canonical masked SSN and the common on-form variants: * or X,
// any of -, _, ., space, or no separator, and either the last four digits or a
// fully-masked tail.
export function isMaskedSSN(value: string): boolean {
  return /^[*Xx]{3,4}[-_.\s]?[*Xx]{2}[-_.\s]?(?:\d{4}|[*Xx]{4})$/.test(value.trim());
}

// A masked SSN whose last four digits are not recoverable from the document —
// the preparer must supply the taxpayer's SSN before filing.
export function isFullyMaskedSSN(value: string): boolean {
  return isMaskedSSN(value) && !/\d/.test(value);
}

// DECISION: only redact unambiguous SSN patterns and values next to an SSN
// label. Bare nine-digit values can be EINs, so blanket masking would degrade
// extraction of payer/employer identifiers.
export function redactSSNsInOcrText(text: string): string {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, (value) => maskSSN(value))
    .replace(/((?:social security|employee)\s*(?:number|ssn)?\s*[:#-]?\s*)(\d{9})\b/gi, (_, label, value) => `${label}${maskSSN(value)}`);
}
