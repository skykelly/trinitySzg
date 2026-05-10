import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import {
  getKnowledgeSource,
  listKnowledgeChunks,
  markKnowledgeSourceIngestFailed,
  replaceKnowledgeSourceChunks
} from "@/lib/db";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sourceId = Number(id);
  if (!Number.isFinite(sourceId)) {
    return NextResponse.json({ error: "올바른 source id가 아닙니다." }, { status: 400 });
  }

  try {
    const source = getKnowledgeSource(sourceId);
    if (!source) return NextResponse.json({ error: "Knowledge Source를 찾을 수 없습니다." }, { status: 404 });

    const rawContent = await readIngestContent(request, source.url);

    if (!rawContent.trim()) {
      const updated = markKnowledgeSourceIngestFailed(sourceId, "추출 가능한 텍스트가 없습니다.");
      return NextResponse.json({ source: updated, chunks: [] }, { status: 422 });
    }

    const updated = replaceKnowledgeSourceChunks(sourceId, rawContent);
    return NextResponse.json({ source: updated, chunks: listKnowledgeChunks(sourceId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "원문 인덱싱 실패";
    const updated = markKnowledgeSourceIngestFailed(sourceId, message);
    return NextResponse.json({ source: updated, chunks: [], error: message }, { status: 500 });
  }
}

async function readIngestContent(request: Request, sourceUrl: string) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const content = String(form.get("content") ?? "").trim();
    if (content) return content;
    if (!(file instanceof File)) return "";
    const buffer = Buffer.from(await file.arrayBuffer());
    if (file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) return parsePdfBuffer(buffer);
    return buffer.toString("utf8");
  }

  const body = (await request.json().catch(() => ({}))) as { content?: string; fetchUrl?: boolean };
  return body.content?.trim() || (body.fetchUrl === false ? "" : await fetchSourceText(sourceUrl));
}

async function fetchSourceText(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "TrinitySzg Knowledge Indexer/0.1"
    }
  });
  if (!res.ok) throw new Error(`원문 가져오기 실패 (${res.status})`);

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
    const buffer = Buffer.from(await res.arrayBuffer());
    return parsePdfBuffer(buffer);
  }

  const text = await res.text();
  if (contentType.includes("html") || looksLikeHtml(text)) return extractReadableText(text);
  return text;
}

async function parsePdfBuffer(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

function looksLikeHtml(text: string) {
  return /<html[\s>]|<body[\s>]|<article[\s>]/i.test(text);
}

function extractReadableText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
