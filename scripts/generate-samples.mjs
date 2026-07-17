// Generates synthetic sample tax documents as PNGs into public/samples/.
// Run once at authoring time: `npm run samples` (then commit the PNGs).
//
// Everything here is entirely fictional — names, addresses, and TINs. SSNs use
// the 000-xx range which is never issued by the SSA, so nothing resembles a real
// person's identifiers. The layouts imitate real IRS form structure well enough
// that the client-side OCR pipeline reads them like genuine scans.

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
  text(ctx, W - M - 120, 70, "2024", "bold 30px Arial");
  text(ctx, M, 100, "Department of the Treasury — Internal Revenue Service", "15px Arial", "#444");

  // employee SSN + EIN row
  box(ctx, M, 130, fullW / 2 - 10, 70, "a  Employee's social security number", "000-42-8817", { big: true });
  box(ctx, M + fullW / 2 + 10, 130, fullW / 2 - 10, 70, "b  Employer identification number (EIN)", "94-2551803", { big: true });

  // employer block
  box(ctx, M, 210, fullW / 2 - 10, 130,
    "c  Employer's name, address, and ZIP code",
    "");
  text(ctx, M + 14, 262, "Northwind Trading Co.", "22px Arial");
  text(ctx, M + 14, 292, "1420 Cedar Street", "20px Arial");
  text(ctx, M + 14, 320, "Portland, OR 97204", "20px Arial");

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
  text(ctx, M + 14, 402, "Miriam A. Callahan", "22px Arial");
  text(ctx, M + 14, 432, "88 Larkspur Lane", "20px Arial");
  text(ctx, M + 14, 460, "Beaverton, OR 97005", "20px Arial");

  box(ctx, rx, 350, rw / 2 - 5, 65, "5  Medicare wages and tips", "62,400.00", { big: true });
  box(ctx, rx + rw / 2 + 5, 350, rw / 2 - 5, 65, "6  Medicare tax withheld", "904.80", { big: true });
  box(ctx, rx, 415, rw / 2 - 5, 65, "7  Social security tips", "", { big: true });
  box(ctx, rx + rw / 2 + 5, 415, rw / 2 - 5, 65, "8  Allocated tips", "", { big: true });

  // box 12/13
  box(ctx, M, 490, fullW / 2 - 10, 90, "12  See instructions for box 12", "D 6,500.00; DD 12,340.00");
  box(ctx, M + fullW / 2 + 10, 490, fullW / 2 - 10, 90, "13  Statutory / Retirement / Sick pay", "Retirement plan: X");

  // state block, boxes 15-20
  const sy = 600;
  box(ctx, M, sy, 140, 70, "15  State", "OR");
  box(ctx, M + 140, sy, 260, 70, "Employer's state ID number", "9988776-01");
  box(ctx, M + 400, sy, 250, 70, "16  State wages, tips, etc.", "62,400.00", { big: true });
  box(ctx, M + 650, sy, 250, 70, "17  State income tax", "4,120.00", { big: true });
  box(ctx, M + 900, sy, fullW - 900 + M - M, 70, "18  Local wages", "");

  box(ctx, M, sy + 80, 300, 70, "19  Local income tax", "");
  box(ctx, M + 300, sy + 80, 300, 70, "20  Locality name", "");

  text(ctx, M, sy + 210, "This is a synthetic sample document for demonstration. All names and numbers are fictional.", "15px Arial", "#666");

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
  box(ctx, M + fullW / 2 + 10, 290, fullW / 2 - 10, 70, "RECIPIENT'S TIN", "000-73-4192", { big: true });

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
  box(ctx, M + fullW / 2 + 10, 290, fullW / 2 - 10, 70, "RECIPIENT'S TIN", "000-58-2247", { big: true });

  box(ctx, M, 370, fullW / 2 - 10, 130, "RECIPIENT'S name and address", "");
  text(ctx, M + 14, 420, "Priya N. Ramaswamy", "22px Arial");
  text(ctx, M + 14, 450, "27 Maplewood Court", "20px Arial");
  text(ctx, M + 14, 478, "Dublin, OH 43017", "20px Arial");

  box(ctx, rx, 370, rw / 2 - 5, 70, "4  Federal income tax withheld", "0.00", { big: true });
  box(ctx, rx + rw / 2 + 5, 370, rw / 2 - 5, 70, "8  Tax-exempt interest", "145.00", { big: true });

  text(ctx, M, 560, "Synthetic sample document. Fictional names and TINs.", "15px Arial", "#666");
  return canvas;
}

// --- run --------------------------------------------------------------------

save(drawW2({ badBox4: false }), "w2-clean.png");
save(drawW2({ badBox4: true }), "w2-box4-error.png");
save(draw1099NEC(), "1099-nec.png");
save(draw1099INT(), "1099-int.png");
console.log("done");
