// External reference data — encoded standards from the SSA and IRS used to
// validate fields against the real world, not just their format.
//
// DECISION: "external" validation here means checking against authoritative
// reference data (SSA number structure, IRS EIN prefixes, W-2 Box 12 code set,
// state/territory codes), NOT calling an external network service. A live check
// like the IRS TIN-matching service would require sending a client's SSN + name
// off the machine, which would break Intake's core privacy posture (identifiers
// never leave the browser). Encoding the standards gives most of the value with
// none of the exposure. Sources are cited in the README.

// --- US states / territories / military post codes --------------------------
// USPS two-letter codes accepted on W-2 Box 15 and 1099 state boxes.
export const US_STATE_CODES = new Set<string>([
  // 50 states
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  // District of Columbia + territories
  "DC", "PR", "GU", "VI", "AS", "MP",
  // military
  "AA", "AE", "AP",
]);

// --- W-2 Box 12 code set (IRS General Instructions for Forms W-2/W-3) --------
// Every currently-defined code. I, O, U, X are intentionally never used.
export const W2_BOX12_CODES = new Set<string>([
  "A", "B", "C", "D", "E", "F", "G", "H", "J", "K",
  "L", "M", "N", "P", "Q", "R", "S", "T", "V", "W",
  "Y", "Z", "AA", "BB", "CC", "DD", "EE", "FF", "GG", "HH",
]);

// --- Valid IRS EIN prefixes (first two digits) ------------------------------
// The 83 prefixes the IRS actually assigns (by campus + online). The 17 missing
// two-digit values (00, 07, 08, 09, 17, 18, 19, 28, 29, 49, 69, 70, 78, 79, 89,
// 96, 97) are unassigned and never appear on a legitimate EIN.
export const EIN_VALID_PREFIXES = new Set<string>([
  "01", "02", "03", "04", "05", "06", "10", "11", "12", "13",
  "14", "15", "16", "20", "21", "22", "23", "24", "25", "26",
  "27", "30", "31", "32", "33", "34", "35", "36", "37", "38",
  "39", "40", "41", "42", "43", "44", "45", "46", "47", "48",
  "50", "51", "52", "53", "54", "55", "56", "57", "58", "59",
  "60", "61", "62", "63", "64", "65", "66", "67", "68", "71",
  "72", "73", "74", "75", "76", "77", "80", "81", "82", "83",
  "84", "85", "86", "87", "88", "90", "91", "92", "93", "94",
  "95", "98", "99",
]);

// --- SSN structural validity (SSA rules, still enforced post-randomization) --
// A well-formed 9-digit SSN can still be structurally impossible: area 000/666/
// 900-999, group 00, and serial 0000 are never issued. Returns a reason string
// when the number is structurally impossible, or null when it's plausible.
export function ssnStructuralIssue(nineDigits: string): string | null {
  if (nineDigits.length !== 9) return null; // format handled elsewhere
  const area = nineDigits.slice(0, 3);
  const group = nineDigits.slice(3, 5);
  const serial = nineDigits.slice(5, 9);
  const areaNum = parseInt(area, 10);
  if (area === "000") return "area number 000 is never issued";
  if (area === "666") return "area number 666 is never issued";
  if (areaNum >= 900) return "area numbers 900–999 are not valid SSNs (ITIN range)";
  if (group === "00") return "group number 00 is never issued";
  if (serial === "0000") return "serial number 0000 is never issued";
  return null;
}

// --- EIN prefix validity ----------------------------------------------------
// Returns the prefix when it's NOT a valid IRS prefix, or null when it's fine.
export function einPrefixIssue(nineDigits: string): string | null {
  if (nineDigits.length !== 9) return null;
  const prefix = nineDigits.slice(0, 2);
  return EIN_VALID_PREFIXES.has(prefix) ? null : prefix;
}

// Pull the individual Box 12 codes out of a combined field like
// "D 6,500.00; DD 12,340.00" or "W 1200 / AA 3000". Returns the letter codes.
export function parseBox12Codes(raw: string): string[] {
  // Codes are 1–2 uppercase letters that precede an amount. Grab letter tokens.
  const matches = raw.toUpperCase().match(/\b[A-Z]{1,2}\b/g);
  return matches ?? [];
}
