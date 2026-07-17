// Click-to-source field provenance: given an extracted field value and the OCR
// word geometry captured during scanning (see lib/ocr.ts), find where on the
// page that value came from.
//
// This is an alignment problem, not a lookup. The model returns a *reformatted*
// value — "62,400.00" — while OCR holds tokens like "$62,400.00" or a run split
// as "62,400" + ".00", possibly reordered on the page. So we normalize both
// sides by field type, slide a window over consecutive tokens, score each
// candidate span, and return the best-scoring region above a type-specific
// threshold. Everything runs client-side against the stored WordBoxes.

import type { FieldType, PageImage, SourceMatch, WordBox } from "./types";

// Widest run of consecutive tokens we'll fuse into one value (e.g. a long
// employer name). Keeps the window scan bounded on token-dense pages.
const MAX_WINDOW = 8;

// Acceptance thresholds. Exact numeric matches score 1; these gate the fuzzy
// paths so an unrelated region never lights up.
const NUMERIC_FUZZY_MIN = 0.82;
const TEXT_MIN = 0.7;

function digitsOf(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

function alnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Classic Levenshtein, iterative with a single rolling row.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1, // deletion
        prev[j - 1] + 1, // insertion
        prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      );
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

// 0..1 similarity; 1 = identical.
function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return 1 - levenshtein(a, b) / max;
}

function unionRect(words: WordBox[]): SourceMatch["rects"][number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const w of words) {
    if (w.x0 < x0) x0 = w.x0;
    if (w.y0 < y0) y0 = w.y0;
    if (w.x1 > x1) x1 = w.x1;
    if (w.y1 > y1) y1 = w.y1;
  }
  return { x0, y0, x1, y1 };
}

interface Best {
  page: number;
  words: WordBox[];
  score: number;
}

function keepBest(current: Best | null, next: Best): Best {
  if (!current) return next;
  if (next.score > current.score) return next;
  // Tie-break: prefer the tighter span (fewer tokens) so a value nested in a
  // longer line highlights just itself.
  if (next.score === current.score && next.words.length < current.words.length) {
    return next;
  }
  return current;
}

// Numeric fields (money, ein, year, percent): compare on digit strings so
// formatting ("$62,400.00" vs "62,400.00" vs "62400") never blocks a match.
function locateNumeric(pages: PageImage[], value: string): Best | null {
  const target = digitsOf(value);
  // A one-digit target (a lone "0") collides with everything; refuse rather
  // than light up an arbitrary zero.
  if (target.length < 2) return null;

  let best: Best | null = null;
  pages.forEach((page, pageIdx) => {
    const words = page.words ?? [];
    for (let i = 0; i < words.length; i++) {
      let combined = "";
      const span: WordBox[] = [];
      for (let j = i; j < Math.min(i + MAX_WINDOW, words.length); j++) {
        combined += digitsOf(words[j].text);
        span.push(words[j]);
        if (!combined) continue;
        if (combined.length > target.length + 3) break; // overshoot — stop growing
        let score: number;
        if (combined === target) {
          // Exact digits. Nudge by formatted-text closeness so that, among
          // duplicate amounts, the token whose punctuation matches the value
          // wins — and shorter spans edge out longer ones.
          score = 1 + ratio(alnum(value), alnum(span.map((w) => w.text).join(""))) * 0.001;
        } else {
          score = ratio(target, combined);
          if (score < NUMERIC_FUZZY_MIN) continue;
        }
        best = keepBest(best, { page: pageIdx, words: [...span], score });
        if (combined === target) break; // no point extending an exact match
      }
    }
  });
  return best;
}

// Masked SSNs arrive as "***-**-1234"; only the last four survive privacy
// redaction. Match a token (or short run) whose digits end in those four and
// read like an SSN/TIN.
function locateSsn(pages: PageImage[], value: string): Best | null {
  const last4 = digitsOf(value).slice(-4);
  if (last4.length !== 4) return null;

  let best: Best | null = null;
  pages.forEach((page, pageIdx) => {
    const words = page.words ?? [];
    for (let i = 0; i < words.length; i++) {
      let combined = "";
      const span: WordBox[] = [];
      for (let j = i; j < Math.min(i + 3, words.length); j++) {
        combined += digitsOf(words[j].text);
        span.push(words[j]);
        if (combined.length > 9) break;
        if (combined.length >= 4 && combined.endsWith(last4)) {
          // Full 9-digit run ending in the right four is the confident hit;
          // a shorter fragment ending in them is a weaker fallback.
          const score = combined.length === 9 ? 1 : 0.85;
          best = keepBest(best, { page: pageIdx, words: [...span], score });
        }
      }
    }
  });
  return best;
}

// Free text (names, addresses, codes): align the value's word sequence against
// runs of page tokens, scoring on collapsed-alphanumeric similarity.
function locateText(pages: PageImage[], value: string): Best | null {
  const valueTokens = value
    .split(/\s+/)
    .map(alnum)
    .filter(Boolean);
  if (valueTokens.length === 0) return null;
  const targetJoined = valueTokens.join("");
  const n = valueTokens.length;
  // Try window sizes around the value's token count to absorb OCR splits/merges.
  const sizes = Array.from(
    new Set([Math.max(1, n - 1), n, n + 1].filter((s) => s <= MAX_WINDOW)),
  );

  let best: Best | null = null;
  pages.forEach((page, pageIdx) => {
    const words = page.words ?? [];
    for (const size of sizes) {
      for (let i = 0; i + size <= words.length; i++) {
        const span = words.slice(i, i + size);
        const joined = span.map((w) => alnum(w.text)).join("");
        if (!joined) continue;
        const score = ratio(targetJoined, joined);
        if (score < TEXT_MIN) continue;
        best = keepBest(best, { page: pageIdx, words: span, score });
      }
    }
  });
  return best;
}

const NUMERIC_TYPES: FieldType[] = ["money", "ein", "year", "percent"];

// Entry point. Returns the on-page region a field value came from, or null when
// nothing scores above threshold (a genuinely unlocatable value — the UI should
// say so rather than point at the wrong place).
export function locateField(
  pages: PageImage[],
  value: string,
  type: FieldType,
): SourceMatch | null {
  const v = (value ?? "").trim();
  if (!v || pages.length === 0) return null;
  const hasGeometry = pages.some((p) => (p.words?.length ?? 0) > 0);
  if (!hasGeometry) return null;

  let best: Best | null;
  if (type === "ssn") best = locateSsn(pages, v);
  else if (NUMERIC_TYPES.includes(type)) {
    // Fall back to text matching when the value carries no usable digits
    // (e.g. a "state" code mistyped into a numeric field).
    best = locateNumeric(pages, v) ?? locateText(pages, v);
  } else best = locateText(pages, v);

  if (!best) return null;
  return {
    page: best.page,
    rects: [unionRect(best.words)],
    // Cap at 1 — exact numeric matches carry a tiny tie-break bonus above 1.
    score: Math.min(1, best.score),
  };
}
