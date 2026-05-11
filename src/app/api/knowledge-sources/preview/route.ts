import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url) return NextResponse.json({ error: "url이 필요합니다." }, { status: 400 });

    const res = await fetch(url, {
      headers: { "User-Agent": "TrinitySzg Knowledge Indexer/0.1" },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      return NextResponse.json({ error: `페이지를 가져오지 못했습니다 (${res.status})` }, { status: 422 });
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf") || url.toLowerCase().endsWith(".pdf")) {
      const filename = url.split("/").pop()?.replace(/\.pdf$/i, "") ?? "PDF Document";
      return NextResponse.json({
        title: decodeURIComponent(filename),
        summary: "",
        tags: [],
        sourceType: "research",
        reliability: "medium"
      });
    }

    const html = await res.text();
    const title = extractMeta(html, ["og:title"]) || extractTag(html, "title") || "";
    const summary = extractMeta(html, ["og:description", "description", "twitter:description"]) || extractFirstParagraph(html);
    const keywords = extractMeta(html, ["keywords"]);
    const tags = keywords
      ? keywords.split(/[,;]/).map((t) => t.trim()).filter(Boolean).slice(0, 6)
      : [];

    return NextResponse.json({
      title: cleanText(title).slice(0, 200),
      summary: cleanText(summary).slice(0, 800),
      tags,
      sourceType: guessSourceType(url),
      reliability: guessReliability(url)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "미리보기 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function extractMeta(html: string, names: string[]): string {
  for (const name of names) {
    const patterns = [
      new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i")
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]?.trim()) return match[1].trim();
    }
  }
  return "";
}

function extractTag(html: string, tag: string): string {
  const match = html.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractFirstParagraph(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  const match = stripped.match(/<p[^>]*>([^<]{60,})<\/p>/i);
  if (!match) return "";
  return match[1].replace(/<[^>]+>/g, " ").trim();
}

function cleanText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guessSourceType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("mckinsey") || u.includes("deloitte") || u.includes("bain") || u.includes("forrester") || u.includes("gartner")) return "industry_report";
  if (u.includes("arxiv") || u.includes("nature.com") || u.includes("mdpi") || u.includes("springer") || u.includes("acm.org") || u.includes("ieee.org") || u.includes("pubmed") || u.includes("kaist") || u.includes("oecd") || u.includes("uil.unesco")) return "research";
  if (u.includes("github.com")) return "open_source";
  if (u.includes("docs.") || u.includes("cloud.google") || u.includes("azure.com") || u.includes("aws.amazon")) return "official_documentation";
  if (u.includes("blog.") || u.includes("/blog/") || u.includes("medium.com") || u.includes("substack")) return "blog";
  return "external_source";
}

function guessReliability(url: string): "very_high" | "high" | "medium" | "low" {
  const u = url.toLowerCase();
  const veryHigh = ["mckinsey", "deloitte.com", "bain.com", "gallup.com", "oecd.org", "microsoft.com", "google.com", "zuora.com", "gartner.com", "forrester.com", "nature.com", "ieee.org", "acm.org"];
  const high = ["reuters.com", "theverge.com", "techradar.com", "mdpi.com", "kaist", "uil.unesco", "grandviewresearch.com", "arxiv.org", "aws.amazon", "azure.com", "cloud.google", "lg.com"];
  if (veryHigh.some((k) => u.includes(k))) return "very_high";
  if (high.some((k) => u.includes(k))) return "high";
  return "medium";
}
