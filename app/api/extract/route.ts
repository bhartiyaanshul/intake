import { NextRequest, NextResponse } from "next/server";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/prompt";
import type { ExtractionResult, FormType, K1Variant } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
// Use the "latest" alias so the fallback keeps working as Google retires dated
// models — pinned IDs like gemini-2.5-flash-lite now 404 for new API keys.
const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";
const MAX_OCR_TEXT_CHARS = 35_000;
const SUPPORTED: FormType[] = ["W-2", "1099-NEC", "1099-INT", "1099-DIV", "1099-R", "1099-MISC", "1099-SA", "1098", "1099-G", "SSA-1099", "K-1", "1098-E", "1098-T", "CHARITABLE_RECEIPT", "UNKNOWN"];

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function stripCodeFences(value: string): string {
  const fence = value.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1].trim() : value.trim();
}

function normalize(raw: unknown, provider: "groq" | "gemini"): ExtractionResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const candidate = String(obj.formType ?? "UNKNOWN") as FormType;
  const formType = SUPPORTED.includes(candidate) ? candidate : "UNKNOWN";
  const fields: ExtractionResult["fields"] = {};
  for (const [key, rawValue] of Object.entries((obj.fields ?? {}) as Record<string, unknown>)) {
    if (rawValue == null) continue;
    if (typeof rawValue === "object") {
      const value = rawValue as Record<string, unknown>;
      const confidence = Number(value.confidence);
      fields[key] = { value: value.value == null ? null : String(value.value), confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5 };
    } else fields[key] = { value: String(rawValue), confidence: 0.5 };
  }
  const variant = ["1065", "1120-S", "1041"].includes(String(obj.variant)) ? String(obj.variant) as K1Variant : undefined;
  return { formType, variant, provider, fields };
}

async function requestJson(url: string, init: RequestInit, timeoutMessage: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  catch (error) {
    if ((error as Error)?.name === "AbortError") throw new ApiError(timeoutMessage, 504);
    throw new ApiError(`Provider request failed: ${(error as Error).message}`, 502);
  } finally { clearTimeout(timeout); }
}

async function callGroq(apiKey: string, model: string, prompt: string, attempt = 0): Promise<string> {
  const response = await requestJson(GROQ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }] }) }, "Groq request timed out.");
  if (response.status === 429) {
    const retryAfterSeconds = parseFloat(response.headers.get("retry-after") ?? "");
    // DECISION: retry only short provider cooldowns. Waiting through a quota reset in a server request masks the useful recovery path and eventually times out.
    if (attempt < 1 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds <= 15) { await sleep(Math.ceil(retryAfterSeconds * 1000)); return callGroq(apiKey, model, prompt, attempt + 1); }
    const message = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 15 ? `Groq quota is exhausted for about ${Math.ceil(retryAfterSeconds / 60)} minutes.` : "Groq rate limit reached.";
    throw new ApiError(message, 429);
  }
  if (!response.ok) throw new ApiError(`Groq API error ${response.status}: ${(await response.text()).slice(0, 300)}`, response.status);
  const content = ((await response.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
  if (!content) throw new ApiError("Groq returned an empty response.", 502);
  return content;
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await requestJson(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }) }, "Gemini request timed out.");
  if (!response.ok) {
    // DECISION: provider payloads can contain billing links and long quota
    // diagnostics. Keep the preparer's recovery message concise and actionable.
    if (response.status === 429) throw new ApiError("Gemini quota is currently exhausted.", 429);
    throw new ApiError(`Gemini API error ${response.status}.`, response.status);
  }
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; promptFeedback?: { blockReason?: string } };
  const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!content) throw new ApiError(data.promptFeedback?.blockReason ? `Gemini blocked the request: ${data.promptFeedback.blockReason}.` : "Gemini returned an empty response.", 502);
  return content;
}

export async function POST(req: NextRequest) {
  let ocrText = ""; let fileName = "document";
  try { const body = (await req.json()) as { ocrText?: string; fileName?: string }; ocrText = (body.ocrText ?? "").trim(); fileName = body.fileName ?? "document"; }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (!ocrText) return NextResponse.json({ error: "No OCR text was produced for this document." }, { status: 400 });
  if (ocrText.length > MAX_OCR_TEXT_CHARS) return NextResponse.json({ error: `This document produced ${ocrText.toLocaleString()} OCR characters. Intake is optimized for individual source forms; split this multi-page workpaper or upload the underlying W-2, 1099, or 1098 forms before extraction.` }, { status: 413 });

  const prompt = buildUserPrompt(ocrText, fileName);
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  let provider: "groq" | "gemini";
  let raw: string;
  let groqError: ApiError | undefined;
  if (groqKey) {
    try { raw = await callGroq(groqKey, process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL, prompt); provider = "groq"; }
    catch (error) { groqError = error instanceof ApiError ? error : new ApiError("Groq extraction failed.", 502); raw = ""; provider = "groq"; }
  } else { raw = ""; provider = "groq"; groqError = new ApiError("GROQ_API_KEY is not configured.", 500); }
  if (!raw && geminiKey) {
    try { raw = await callGemini(geminiKey, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, prompt); provider = "gemini"; }
    catch (error) {
      const geminiError = error instanceof ApiError ? error : new ApiError("Gemini extraction failed.", 502);
      return NextResponse.json({ error: `Groq failed: ${groqError?.message ?? "unknown error"} Gemini fallback failed: ${geminiError.message}` }, { status: geminiError.status });
    }
  }
  if (!raw) return NextResponse.json({ error: `${groqError?.message ?? "Extraction failed."} Configure GEMINI_API_KEY to enable the fallback provider.` }, { status: groqError?.status ?? 502 });
  try { return NextResponse.json(normalize(JSON.parse(stripCodeFences(raw)), provider)); }
  catch { return NextResponse.json({ error: `${provider === "groq" ? "Groq" : "Gemini"} returned malformed JSON. Retry this document.` }, { status: 502 }); }
}
