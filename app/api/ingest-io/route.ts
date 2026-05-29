import { NextResponse } from "next/server";
import { analyzeUrl, parseIngestRequest, normalizeUrl } from "./analysis";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseIngestRequest(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please provide a valid URL and optional intent." },
      { status: 400 }
    );
  }

  let normalized: string;
  try {
    normalized = normalizeUrl(parsed.data.url);
  } catch {
    return NextResponse.json({ error: "That URL could not be parsed." }, { status: 400 });
  }

  try {
    const result = await analyzeUrl({
      url: normalized,
      intent: parsed.data.intent?.trim() || "",
    });

    return NextResponse.json({ card: result.card });
  } catch (error) {
    console.error("ingest-io analyze failed", error);
    return NextResponse.json({ error: "Ingestion analysis failed." }, { status: 500 });
  }
}
