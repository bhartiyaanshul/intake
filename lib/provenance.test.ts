// Tests for click-to-source provenance matching. Runnable via
// `npx tsx lib/provenance.test.ts`. Uses synthetic WordBoxes so it exercises
// the alignment logic without a browser / real OCR.

import { locateField } from "./provenance";
import type { PageImage, WordBox } from "./types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

// Lay tokens out on a simple grid; exact coords don't matter for these tests,
// only which tokens the matcher selects. We tag each with a row/col.
function word(text: string, col: number, row: number): WordBox {
  const x0 = col * 0.1;
  const y0 = row * 0.05;
  return { text, x0, y0, x1: x0 + 0.08, y1: y0 + 0.03 };
}

function page(words: WordBox[]): PageImage {
  return { dataUrl: "", width: 1000, height: 1400, words };
}

// The union rect the matcher returns should cover exactly the given tokens.
function coversOnly(
  match: { rects: { x0: number; y0: number; x1: number; y1: number }[] } | null,
  tokens: WordBox[],
): boolean {
  if (!match || match.rects.length !== 1) return false;
  const r = match.rects[0];
  const x0 = Math.min(...tokens.map((t) => t.x0));
  const y0 = Math.min(...tokens.map((t) => t.y0));
  const x1 = Math.max(...tokens.map((t) => t.x1));
  const y1 = Math.max(...tokens.map((t) => t.y1));
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  return close(r.x0, x0) && close(r.y0, y0) && close(r.x1, x1) && close(r.y1, y1);
}

// --- money: reformatted value vs raw OCR token ------------------------------
{
  const amt = word("$62,400.00", 3, 5);
  const p = page([word("Wages", 0, 5), word("box1", 1, 5), amt]);
  const m = locateField([p], "62,400.00", "money");
  assert(coversOnly(m, [amt]), "money: 62,400.00 matches $62,400.00 token");
}

// --- money: value split across two tokens -----------------------------------
{
  const a = word("62,400", 2, 5);
  const b = word(".00", 3, 5);
  const p = page([word("Wages", 0, 5), a, b]);
  const m = locateField([p], "62400.00", "money");
  assert(coversOnly(m, [a, b]), "money: split token 62,400 + .00 fuses into one box");
}

// --- money: duplicate amounts, prefer the token matching value formatting ----
{
  const zero1 = word("0", 2, 4);
  const zero2 = word("0.00", 2, 8);
  const p = page([zero1, zero2]);
  const m = locateField([p], "0.00", "money");
  // Single-digit "0" target is refused; "0.00" is two+ digits and should match.
  assert(m != null && m.rects[0].y0 === zero2.y0, "money: 0.00 matches the two-digit token, not lone 0");
}

// --- year -------------------------------------------------------------------
{
  const yr = word("2024", 4, 1);
  const p = page([word("Tax", 0, 1), word("year", 1, 1), yr]);
  const m = locateField([p], "2024", "year");
  assert(coversOnly(m, [yr]), "year: 2024 matches");
}

// --- masked SSN: match on last four, prefer full 9-digit run ----------------
{
  const ssn = word("412-73-4192", 3, 2);
  const p = page([word("SSN", 0, 2), ssn]);
  const m = locateField([p], "***-**-4192", "ssn");
  assert(coversOnly(m, [ssn]) && m!.score === 1, "ssn: masked value matches full SSN by last four");
}

// --- masked SSN: three-token run --------------------------------------------
{
  const a = word("412", 2, 2);
  const b = word("73", 3, 2);
  const c = word("4192", 4, 2);
  const p = page([a, b, c]);
  const m = locateField([p], "***-**-4192", "ssn");
  assert(coversOnly(m, [a, b, c]), "ssn: three-token 412 73 4192 fuses to one box");
}

// --- multi-word text (employer name) ----------------------------------------
{
  const a = word("Northwind", 1, 0);
  const b = word("Traders", 2, 0);
  const c = word("LLC", 3, 0);
  const p = page([word("Employer", 0, 0), a, b, c]);
  const m = locateField([p], "Northwind Traders LLC", "text");
  assert(coversOnly(m, [a, b, c]), "text: multi-word employer name matches full span");
}

// --- text tolerates a small OCR misread -------------------------------------
{
  const a = word("Northwlnd", 1, 0); // OCR 'i' -> 'l'
  const b = word("Traders", 2, 0);
  const p = page([a, b]);
  const m = locateField([p], "Northwind Traders", "text");
  assert(coversOnly(m, [a, b]), "text: fuzzy-matches an OCR typo");
}

// --- multi-page: match lands on the right page ------------------------------
{
  const p0 = page([word("nothing", 0, 0)]);
  const target = word("2024", 4, 1);
  const p1 = page([word("Tax", 0, 1), target]);
  const m = locateField([p0, p1], "2024", "year");
  assert(m != null && m.page === 1, "multi-page: match reports the correct page index");
}

// --- multi-line value splits into one tight rect per line -------------------
{
  const l1 = [word("6304", 1, 3), word("GROVER", 2, 3), word("AVE", 3, 3)];
  const l2 = [word("AUSTIN", 1, 4), word("TX", 2, 4)];
  const p = page([...l1, ...l2]);
  const m = locateField([p], "6304 GROVER AVE AUSTIN TX", "text");
  assert(m != null && m.rects.length === 2, "address: multi-line value yields one rect per line");
}

// --- same-line value spread across a cell splits at the gap -----------------
{
  const code = word("AA", 1, 6); // x0 0.1..0.18
  const amount: WordBox = { text: "929.40", x0: 0.7, y0: 0.3, x1: 0.8, y1: 0.33 }; // same line, far right
  const p = page([code, amount]);
  const m = locateField([p], "AA 929.40", "text");
  assert(m != null && m.rects.length === 2, "box 12: code + far amount split into two tight rects, not one wide box");
}

// --- adjacent same-line tokens stay a single rect ---------------------------
{
  const p = page([word("GROVER", 1, 0), word("AVE", 2, 0)]);
  const m = locateField([p], "GROVER AVE", "text");
  assert(m != null && m.rects.length === 1, "adjacent words on one line stay a single rect");
}

// --- no match returns null --------------------------------------------------
{
  const p = page([word("Nothing", 0, 0), word("relevant", 1, 0), word("here", 2, 0)]);
  const m = locateField([p], "99,999.99", "money");
  assert(m === null, "no-match: unfound value returns null");
}

// --- no geometry returns null -----------------------------------------------
{
  const p: PageImage = { dataUrl: "", width: 10, height: 10 }; // no words
  const m = locateField([p], "62,400.00", "money");
  assert(m === null, "no-geometry: pages without word boxes return null");
}

// --- summary ----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
