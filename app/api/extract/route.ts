import { NextRequest, NextResponse } from "next/server";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/prompt";
import type { ExtractionResult, FormType } from "@/lib/types";

// Server-side extraction route. Receives OCR text (never document images), calls
// Groq's OpenAI-compatible chat completions endpoint, and returns normalized
// { formType, fields } to the client. The GROQ_API_KEY never reaches the browser.

export const runtime = "nodejs";
export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

const SUPPORTED: FormType[] = [
  "W-2",
  "1099-NEC",
  "1099-INT",
  "1099-DIV",
  "1099-R",
  "1099-MISC",
  "1098",
  "UNKNOWN",
];

// Strip ```json fences the model sometimes adds despite json_object mode.
function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) return fence[1].trim();
  return trimmed;
}

// Normalize whatever the model returns into our strict ExtractionResult shape.
function normalize(raw: unknown): ExtractionResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  let formType = String(obj.formType ?? "UNKNOWN") as FormType;
  if (!SUPPORTED.includes(formType)) formType = "UNKNOWN";

  const rawFields = (obj.fields ?? {}) as Record<string, unknown>;
  const fields: ExtractionResult["fields"] = {};
  for (const [key, v] of Object.entries(rawFields)) {
    if (v == null) continue;
    if (typeof v === "object") {
      const fv = v as Record<string, unknown>;
      const value =
        fv.value == null ? null : String(fv.value);
      let confidence = Number(fv.confidence);
      if (!Number.isFinite(confidence)) confidence = 0.5;
      confidence = Math.min(1, Math.max(0, confidence));
      fields[key] = { value, confidence };
    } else {
      // Model returned a bare scalar for the field — wrap it.
      fields[key] = { value: String(v), confidence: 0.5 };
    }
  }
  return { formType, fields };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGroq(
  apiKey: string,
  model: string,
  ocrText: string,
  fileName: string,
  attempt = 0,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(ocrText, fileName) },
        ],
      }),
      signal: controller.signal,
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      // Auto-retry once on rate limit before surfacing to the preparer. Honor
      // Retry-After when present, capped so we stay inside maxDuration.
      if (attempt < 1) {
        const waitMs = Math.min(
          retryAfter ? Math.ceil(parseFloat(retryAfter) * 1000) : 2500,
          8000,
        );
        clearTimeout(timeout);
        await sleep(Number.isFinite(waitMs) && waitMs > 0 ? waitMs : 2500);
        return callGroq(apiKey, model, ocrText, fileName, attempt + 1);
      }
      throw new ApiError(
        `Groq rate limit reached${
          retryAfter ? ` — retry after ${retryAfter}s` : ""
        }. Retry in a moment.`,
        429,
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(
        `Groq API error ${res.status}: ${body.slice(0, 300)}`,
        res.status,
      );
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new ApiError("Groq returned an empty response.", 502);
    return content;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error)?.name === "AbortError")
      throw new ApiError("Groq request timed out. Retry.", 504);
    throw new ApiError(
      `Failed to reach Groq: ${(err as Error).message}`,
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "GROQ_API_KEY is not set on the server. Add it to .env.local (see .env.example) and restart.",
      },
      { status: 500 },
    );
  }

  let ocrText = "";
  let fileName = "document";
  try {
    const body = (await req.json()) as { ocrText?: string; fileName?: string };
    ocrText = (body.ocrText ?? "").trim();
    fileName = body.fileName ?? "document";
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!ocrText) {
    return NextResponse.json(
      { error: "No OCR text was produced for this document." },
      { status: 400 },
    );
  }

  try {
    const rawContent = await callGroq(apiKey, model, ocrText, fileName);

    // Parse JSON, retrying once after stripping code fences on failure.
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      try {
        parsed = JSON.parse(stripCodeFences(rawContent));
      } catch {
        return NextResponse.json(
          {
            error:
              "The model returned malformed JSON. This document landed in a retry state.",
          },
          { status: 502 },
        );
      }
    }

    const result = normalize(parsed);
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Unknown extraction error.";
    return NextResponse.json({ error: message }, { status });
  }
}
