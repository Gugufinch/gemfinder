import { NextResponse } from "next/server";
import {
  parseInsightsRequest,
  sanitizeCards,
  computeCategoryAggregates,
  computeCoverageGaps,
  buildRadar,
  runDecisionEngine,
} from "../analysis";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseInsightsRequest(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid insights payload.", details: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const cards = sanitizeCards(parsed.data.cards);
    const aggregates = computeCategoryAggregates(cards);
    const coverageGaps = computeCoverageGaps(cards);
    const radar = buildRadar(cards);
    const decision = runDecisionEngine(cards, parsed.data.decision);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      aggregates,
      coverageGaps,
      radar,
      decision,
    });
  } catch (error) {
    console.error("ingest-io insights failed", error);
    return NextResponse.json({ error: "Insights computation failed." }, { status: 500 });
  }
}
