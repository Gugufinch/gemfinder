import { NextResponse } from "next/server";
import { parseRefreshRequest, refreshCards } from "../analysis";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parseRefreshRequest(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid refresh payload.", details: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const result = await refreshCards({
      cards: parsed.data.cards,
      mode: parsed.data.mode,
    });

    return NextResponse.json({
      mode: parsed.data.mode,
      refreshedAt: new Date().toISOString(),
      cards: result.cards,
      events: result.events,
    });
  } catch (error) {
    console.error("ingest-io refresh failed", error);
    return NextResponse.json({ error: "Refresh process failed." }, { status: 500 });
  }
}
