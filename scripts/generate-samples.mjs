// Generates synthetic sample tax documents as PNGs into public/samples/.
// Run once at authoring time: `npm run samples` (then commit the PNGs).
//
// Everything here is entirely fictional — names, addresses, and TINs. The SSNs
// are obviously-patterned placeholders (e.g. 412-42-8817) that are structurally
// valid so they pass the app's SSA-structure check and let the "clean" samples
// demonstrate the green path; they don't resemble any real person's number and
// the forms are watermarked as synthetic. The layouts imitate real IRS form
// structure well enough that the client-side OCR pipeline reads them like scans.

import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "samples");
mkdirSync(OUT_DIR, { recursive: true });

const W = 1275; // ~ 8.5in @ 150dpi (layout coordinate space)
const H = 1650; // ~ 11in @ 150dpi
// Render at a higher device scale so client-side Tesseract reads the small
// monospace values (SSNs, box amounts) accurately. Layout code keeps using the
// W/H coordinate space; the canvas itself is SCALE× larger (~255 dpi).
const SCALE = 1.7;

function newPage() {
  const canvas = createCanvas(Math.round(W * SCALE), Math.round(H * SCALE));
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  return { canvas, ctx };
}

// A labeled box: small label in the top-left, larger value below.
function box(ctx, x, y, w, h, label, value, opts = {}) {
  ctx.lineWidth = opts.thick ? 2 : 1;
  ctx.strokeStyle = "#000000";
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#333333";
  ctx.font = "16px Arial";
  ctx.fillText(label, x + 8, y + 22);
  if (value != null && value !== "") {
    ctx.fillStyle = "#000000";
    ctx.font = `${opts.big ? "bold 26px" : "22px"} "Courier New", monospace`;
    ctx.fillText(String(value), x + 12, y + h - 14);
  }
}

function text(ctx, x, y, str, font = "20px Arial", color = "#000") {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.fillText(str, x, y);
}

function save(canvas, name) {
  const buf = canvas.toBuffer("image/png");
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`wrote public/samples/${name}`);
}

// --- W-2 --------------------------------------------------------------------

function drawW2({ badBox4 = false } = {}) {
  const { canvas, ctx } = newPage();
  const M = 60;
  const fullW = W - M * 2;

  text(ctx, M, 70, "Form W-2  Wage and Tax Statement", "bold 32px Arial");
  text(ctx, W - M - 120, 70, "2025", "bold 30px Arial");
  text(ctx, M, 100, "Department of the Treasury — Internal Revenue Service", "15px Arial", "#444");

  // employee SSN + EIN row
  box(ctx, M, 130, fullW / 2 - 10, 70, "a  Employee's social security number", "412-42-8817", { big: true });
  box(ctx, M + fullW / 2 + 10, 130, fullW / 2 - 10, 70, "b  Employer identification number (EIN)", "94-2551803", { big: true });

  // employer block
  box(ctx, M, 210, fullW / 2 - 10, 130,
    "c  Employer's name, address, and ZIP code",
    "");
  text(ctx, M + 14, 262, "Sample Retirement Services Inc.", "22px Arial");
  text(ctx, M + 14, 292, "1420 Cedar Street", "20px Arial");
  text(ctx, M + 14, 320, "Austin, TX 78701", "20px Arial");

  // wages boxes 1-2
  const rx = M + fullW / 2 + 10;
  const rw = fullW / 2 - 10;
  box(ctx, rx, 210, rw / 2 - 5, 65, "1  Wages, tips, other comp.", "62,400.00", { big: true });
  box(ctx, rx + rw / 2 + 5, 210, rw / 2 - 5, 65, "2  Federal income tax withheld", "8,930.00", { big: true });
  box(ctx, rx, 275, rw / 2 - 5, 65, "3  Social security wages", "62,400.00", { big: true });
  // Box 4: correct = 6.2% of 62,400 = 3,868.80. Bad variant uses a wrong figure.
  box(ctx, rx + rw / 2 + 5, 275, rw / 2 - 5, 65, "4  Social security tax withheld",
    badBox4 ? "2,150.00" : "3,868.80", { big: true });

  // employee name/address
  box(ctx, M, 350, fullW / 2 - 10, 130, "e  Employee's name, address, and ZIP code", "");
  text(ctx, M + 14, 402, "Taylor M. Sample", "22px Arial");
  text(ctx, M + 14, 432, "88 Larkspur Lane", "20px Arial");
  text(ctx, M + 14, 460, "Austin, TX 78704", "20px Arial");

  box(ctx, rx, 350, rw / 2 - 5, 65, "5  Medicare wages and tips", "62,400.00", { big: true });
  box(ctx, rx + rw / 2 + 5, 350, rw / 2 - 5, 65, "6  Medicare tax withheld", "904.80", { big: true });
  box(ctx, rx, 415, rw / 2 - 5, 65, "7  Social security tips", "", { big: true });
  box(ctx, rx + rw / 2 + 5, 415, rw / 2 - 5, 65, "8  Allocated tips", "", { big: true });

  // box 12/13
  box(ctx, M, 490, fullW / 2 - 10, 90, "12  See instructions for box 12", "D 6,500.00; DD 12,340.00");
  box(ctx, M + fullW / 2 + 10, 490, fullW / 2 - 10, 90, "13  Statutory / Retirement / Sick pay", "Retirement plan: X");

  // state block, boxes 15-20
  const sy = 600;
  box(ctx, M, sy, 140, 70, "15  State", "TX");
  box(ctx, M + 140, sy, 260, 70, "Employer's state ID number", "9988776-01");
  box(ctx, M + 400, sy, 250, 70, "16  State wages, tips, etc.", "62,400.00", { big: true });
  box(ctx, M + 650, sy, 250, 70, "17  State income tax", "4,120.00", { big: true });
  box(ctx, M + 900, sy, fullW - 900 + M - M, 70, "18  Local wages", "");

  box(ctx, M, sy + 80, 300, 70, "19  Local income tax", "");
  box(ctx, M + 300, sy + 80, 300, 70, "20  Locality name", "");

  text(ctx, M, sy + 210, "SYNTHETIC DEMO ONLY — all names, addresses, and TINs are fictional.", "bold 15px Arial", "#666");

  return canvas;
}

// --- 1099-NEC ---------------------------------------------------------------

function draw1099NEC() {
  const { canvas, ctx } = newPage();
  const M = 60;
  const fullW = W - M * 2;

  text(ctx, M, 70, "Form 1099-NEC", "bold 32px Arial");
  text(ctx, M, 100, "Nonemployee Compensation", "22px Arial");
  text(ctx, W - M - 120, 70, "2024", "bold 30px Arial");

  box(ctx, M, 130, fullW / 2 - 10, 150,
    "PAYER'S name, street address, city, state, ZIP", "");
  text(ctx, M + 14, 178, "Cascade Web Studios LLC", "22px Arial");
  text(ctx, M + 14, 208, "700 SW 5th Ave, Suite 400", "20px Arial");
  text(ctx, M + 14, 236, "Seattle, WA 98101", "20px Arial");

  const rx = M + fullW / 2 + 10;
  const rw = fullW / 2 - 10;
  box(ctx, rx, 130, rw, 75, "1  Nonemployee compensation", "48,500.00", { big: true });
  box(ctx, rx, 205, rw, 75, "4  Federal income tax withheld", "0.00", { big: true });

  box(ctx, M, 290, fullW / 2 - 10, 70, "PAYER'S TIN", "81-4455221", { big: true });
  box(ctx, M + fullW / 2 + 10, 290, fullW / 2 - 10, 70, "RECIPIENT'S TIN", "512-73-4192", { big: true });

  box(ctx, M, 370, fullW / 2 - 10, 130, "RECIPIENT'S name and address", "");
  text(ctx, M + 14, 420, "Devon R. Okafor", "22px Arial");
  text(ctx, M + 14, 450, "312 Birchwood Dr", "20px Arial");
  text(ctx, M + 14, 478, "Tacoma, WA 98402", "20px Arial");

  box(ctx, rx, 370, rw / 3 - 5, 70, "5  State tax withheld", "");
  box(ctx, rx + rw / 3 + 5, 370, rw / 3 - 5, 70, "6  State/Payer's no.", "WA");
  box(ctx, rx + (rw / 3) * 2 + 10, 370, rw / 3 - 5, 70, "7  State income", "");

  text(ctx, M, 560, "Synthetic sample document. Fictional names and TINs.", "15px Arial", "#666");
  return canvas;
}

// --- 1099-INT ---------------------------------------------------------------

function draw1099INT() {
  const { canvas, ctx } = newPage();
  const M = 60;
  const fullW = W - M * 2;

  text(ctx, M, 70, "Form 1099-INT", "bold 32px Arial");
  text(ctx, M, 100, "Interest Income", "22px Arial");
  text(ctx, W - M - 120, 70, "2024", "bold 30px Arial");

  box(ctx, M, 130, fullW / 2 - 10, 150,
    "PAYER'S name, street address, city, state, ZIP", "");
  text(ctx, M + 14, 178, "First Meridian Bank, N.A.", "22px Arial");
  text(ctx, M + 14, 208, "55 Commerce Plaza", "20px Arial");
  text(ctx, M + 14, 236, "Columbus, OH 43215", "20px Arial");

  const rx = M + fullW / 2 + 10;
  const rw = fullW / 2 - 10;
  box(ctx, rx, 130, rw, 70, "1  Interest income", "1,284.53", { big: true });
  box(ctx, rx, 200, rw / 2 - 5, 70, "2  Early withdrawal penalty", "");
  box(ctx, rx + rw / 2 + 5, 200, rw / 2 - 5, 70, "3  Interest on Treasury obligations", "312.00", { big: true });

  box(ctx, M, 290, fullW / 2 - 10, 70, "PAYER'S TIN", "31-0074562", { big: true });
  box(ctx, M + fullW / 2 + 10, 290, fullW / 2 - 10, 70, "RECIPIENT'S TIN", "623-58-2247", { big: true });

  box(ctx, M, 370, fullW / 2 - 10, 130, "RECIPIENT'S name and address", "");
  text(ctx, M + 14, 420, "Priya N. Ramaswamy", "22px Arial");
  text(ctx, M + 14, 450, "27 Maplewood Court", "20px Arial");
  text(ctx, M + 14, 478, "Dublin, OH 43017", "20px Arial");

  box(ctx, rx, 370, rw / 2 - 5, 70, "4  Federal income tax withheld", "0.00", { big: true });
  box(ctx, rx + rw / 2 + 5, 370, rw / 2 - 5, 70, "8  Tax-exempt interest", "145.00", { big: true });

  text(ctx, M, 560, "Synthetic sample document. Fictional names and TINs.", "15px Arial", "#666");
  return canvas;
}

// --- 1099-R ---------------------------------------------------------------

function draw1099R({ ira = false } = {}) {
  const { canvas, ctx } = newPage();
  const M = 60;
  const fullW = W - M * 2;
  const gross = ira ? "24,860.00" : "58,568.40";
  const withholding = ira ? "2,486.00" : "8,791.08";
  const code = ira ? "7" : "7";

  text(ctx, M, 70, "Form 1099-R", "bold 32px Arial");
  text(ctx, M, 100, "Distributions From Pensions, Annuities, Retirement Plans, IRAs, and Insurance Contracts", "18px Arial");
  text(ctx, W - M - 120, 70, "2025", "bold 30px Arial");

  box(ctx, M, 130, fullW / 2 - 10, 150, "PAYER'S name, street address, city, state, ZIP", "");
  text(ctx, M + 14, 178, ira ? "Summit IRA Custody LLC" : "Sample Employees Retirement System", "21px Arial");
  text(ctx, M + 14, 208, "P.O. Box 13207", "20px Arial");
  text(ctx, M + 14, 236, "Austin, TX 78711", "20px Arial");

  const rx = M + fullW / 2 + 10;
  const rw = fullW / 2 - 10;
  box(ctx, rx, 130, rw / 2 - 5, 75, "1  Gross distribution", gross, { big: true });
  box(ctx, rx + rw / 2 + 5, 130, rw / 2 - 5, 75, "2a  Taxable amount", gross, { big: true });
  box(ctx, rx, 205, rw / 2 - 5, 75, "2b  Taxable amount not determined", "");
  box(ctx, rx + rw / 2 + 5, 205, rw / 2 - 5, 75, "4  Federal income tax withheld", withholding, { big: true });

  box(ctx, M, 290, fullW / 2 - 10, 70, "PAYER'S TIN", ira ? "84-1776442" : "74-6000098", { big: true });
  box(ctx, M + fullW / 2 + 10, 290, fullW / 2 - 10, 70, "RECIPIENT'S TIN", "412-42-8817", { big: true });
  box(ctx, M, 370, fullW / 2 - 10, 130, "RECIPIENT'S name and address", "");
  text(ctx, M + 14, 420, "Taylor M. Sample", "22px Arial");
  text(ctx, M + 14, 450, "88 Larkspur Lane", "20px Arial");
  text(ctx, M + 14, 478, "Austin, TX 78704", "20px Arial");
  box(ctx, rx, 370, rw / 2 - 5, 70, "7  Distribution code(s)", code, { big: true });
  box(ctx, rx + rw / 2 + 5, 370, rw / 2 - 5, 70, "IRA / SEP / SIMPLE", ira ? "X" : "", { big: true });
  box(ctx, rx, 440, rw / 2 - 5, 70, "14  State tax withheld", "0.00", { big: true });
  box(ctx, rx + rw / 2 + 5, 440, rw / 2 - 5, 70, "15  State / Payer's state no.", "TX / 9988776", { big: true });

  text(ctx, M, 570, "SYNTHETIC DEMO ONLY — fictional retirement distribution sample.", "bold 15px Arial", "#666");
  return canvas;
}

// --- 1099-SA --------------------------------------------------------------

function draw1099SA() {
  const { canvas, ctx } = newPage();
  const M = 60;
  const fullW = W - M * 2;

  text(ctx, M, 70, "Form 1099-SA", "bold 32px Arial");
  text(ctx, M, 100, "Distributions From an HSA, Archer MSA, or Medicare Advantage MSA", "19px Arial");
  text(ctx, W - M - 120, 70, "2025", "bold 30px Arial");

  box(ctx, M, 130, fullW / 2 - 10, 150, "TRUSTEE'S/PAYER'S name, street address, city, state, ZIP", "");
  text(ctx, M + 14, 178, "Sample Health Bank", "22px Arial");
  text(ctx, M + 14, 208, "P.O. Box 271629", "20px Arial");
  text(ctx, M + 14, 236, "Salt Lake City, UT 84127", "20px Arial");
  const rx = M + fullW / 2 + 10;
  const rw = fullW / 2 - 10;
  box(ctx, rx, 130, rw / 2 - 5, 75, "1  Gross distribution", "5,800.11", { big: true });
  box(ctx, rx + rw / 2 + 5, 130, rw / 2 - 5, 75, "2  Earnings on excess contrib.", "0.00", { big: true });
  box(ctx, rx, 205, rw / 2 - 5, 75, "3  Distribution code", "1", { big: true });
  box(ctx, rx + rw / 2 + 5, 205, rw / 2 - 5, 75, "4  FMV on date of death", "", { big: true });
  box(ctx, M, 290, fullW / 2 - 10, 70, "PAYER'S federal identification number", "47-0812345", { big: true });
  box(ctx, M + fullW / 2 + 10, 290, fullW / 2 - 10, 70, "RECIPIENT'S identification number", "412-42-8817", { big: true });
  box(ctx, M, 370, fullW / 2 - 10, 130, "RECIPIENT'S name and address", "");
  text(ctx, M + 14, 420, "Taylor M. Sample", "22px Arial");
  text(ctx, M + 14, 450, "88 Larkspur Lane", "20px Arial");
  text(ctx, M + 14, 478, "Austin, TX 78704", "20px Arial");
  box(ctx, rx, 370, rw, 55, "5  Account type", "HSA: X    Archer MSA:     MA MSA:", { big: true });
  box(ctx, rx, 425, rw, 75, "Account number (see instructions)", "HSA-00012758", { big: true });
  text(ctx, M, 570, "SYNTHETIC DEMO ONLY — fictional HSA distribution sample.", "bold 15px Arial", "#666");
  return canvas;
}

// --- run --------------------------------------------------------------------

save(drawW2({ badBox4: false }), "2025-w2-clean.png");
save(drawW2({ badBox4: true }), "2025-w2-box4-review.png");
save(draw1099R({ ira: false }), "2025-1099-r-pension.png");
save(draw1099R({ ira: true }), "2025-1099-r-ira.png");
save(draw1099SA(), "2025-1099-sa-hsa.png");
console.log("done");
