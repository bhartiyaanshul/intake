// Privacy helpers keep full Social Security numbers out of review state,
// exports, and provider prompts while preserving the last four digits needed
// for preparer matching and review.

export function maskSSN(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9) return `***-**-${digits.slice(-4)}`;
  const lastFour = value.match(/(?:\*|X|x)+[-\s]?(?:\*|X|x)+[-\s]?(\d{4})$/)?.[1];
  return lastFour ? `***-**-${lastFour}` : value;
}

export function isMaskedSSN(value: string): boolean {
  return /^(?:\*{3,4}|X{3,4})[-\s]?(?:\*{2}|X{2})[-\s]?\d{4}$/i.test(value.trim());
}

// DECISION: only redact unambiguous SSN patterns and values next to an SSN
// label. Bare nine-digit values can be EINs, so blanket masking would degrade
// extraction of payer/employer identifiers.
export function redactSSNsInOcrText(text: string): string {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, (value) => maskSSN(value))
    .replace(/((?:social security|employee)\s*(?:number|ssn)?\s*[:#-]?\s*)(\d{9})\b/gi, (_, label, value) => `${label}${maskSSN(value)}`);
}
