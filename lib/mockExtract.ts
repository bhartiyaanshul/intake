// TEMP-MOCK: canned extraction responses for verifying the UI pipeline without a
// live Groq key. Keyed off distinctive OCR text so each sample maps to the right
// form. DELETE this file (and the MOCK_EXTRACT branch in route.ts) before ship.
import type { ExtractionResult } from "./types";

function has(text: string, s: string) {
  return text.toLowerCase().includes(s.toLowerCase());
}

export function mockExtract(ocrText: string): ExtractionResult {
  const t = ocrText;

  if (has(t, "nonemployee") || has(t, "1099-NEC")) {
    return {
      formType: "1099-NEC",
      fields: {
        payer_name: { value: "Cascade Web Studios LLC", confidence: 0.94 },
        payer_tin: { value: "81-4455221", confidence: 0.9 },
        recipient_name: { value: "Devon R. Okafor", confidence: 0.72 },
        recipient_tin: { value: "000-73-4192", confidence: 0.88 },
        box1_nonemployee_comp: { value: "48,500.00", confidence: 0.95 },
        box4_fed_withholding: { value: "0.00", confidence: 0.9 },
        box6_state_id: { value: "WA", confidence: 0.8 },
        tax_year: { value: "2024", confidence: 0.97 },
      },
    };
  }

  if (has(t, "interest income") || has(t, "1099-INT")) {
    return {
      formType: "1099-INT",
      fields: {
        payer_name: { value: "First Meridian Bank, N.A.", confidence: 0.93 },
        payer_tin: { value: "31-0074562", confidence: 0.91 },
        recipient_name: { value: "Priya N. Ramaswamy", confidence: 0.86 },
        recipient_tin: { value: "000-58-2247", confidence: 0.89 },
        box1_interest: { value: "1,284.53", confidence: 0.95 },
        box3_treasury_interest: { value: "312.00", confidence: 0.9 },
        box4_fed_withholding: { value: "0.00", confidence: 0.92 },
        box8_tax_exempt: { value: "145.00", confidence: 0.88 },
        tax_year: { value: "2024", confidence: 0.97 },
      },
    };
  }

  // W-2 (both samples). Box 4 differs between the clean and error variants.
  const box4 = has(t, "2,150") ? "2,150.00" : "3,868.80";
  return {
    formType: "W-2",
    fields: {
      employee_ssn: { value: "000-42-8817", confidence: 0.9 },
      employer_ein: { value: "94-2551803", confidence: 0.88 },
      employer_name: { value: "Northwind Trading Co.", confidence: 0.93 },
      employer_address: { value: "1420 Cedar Street, Portland, OR 97204", confidence: 0.68 },
      employee_name: { value: "Miriam A. Callahan", confidence: 0.91 },
      employee_address: { value: "88 Larkspur Lane, Beaverton, OR 97005", confidence: 0.7 },
      box1_wages: { value: "62,400.00", confidence: 0.96 },
      box2_fed_withholding: { value: "8,930.00", confidence: 0.94 },
      box3_ss_wages: { value: "62,400.00", confidence: 0.95 },
      box4_ss_tax: { value: box4, confidence: 0.92 },
      box5_medicare_wages: { value: "62,400.00", confidence: 0.95 },
      box6_medicare_tax: { value: "904.80", confidence: 0.9 },
      box12: { value: "D 6,500.00; DD 12,340.00", confidence: 0.82 },
      box13: { value: "Retirement plan: X", confidence: 0.78 },
      box15_state: { value: "OR", confidence: 0.85 },
      box15_state_id: { value: "9988776-01", confidence: 0.8 },
      box16_state_wages: { value: "62,400.00", confidence: 0.9 },
      box17_state_tax: { value: "4,120.00", confidence: 0.9 },
      tax_year: { value: "2024", confidence: 0.97 },
    },
  };
}
