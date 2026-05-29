import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { DRUM_MIDI_ROOT, isValidRunId } from "@/lib/drum-midi/config";

export const runtime = "nodejs";

const FILES = {
  midi: {
    fileName: "drums.mid",
    contentType: "audio/midi",
    downloadName: "drums.mid",
    disposition: "attachment",
  },
  preview: {
    fileName: "drums_preview.wav",
    contentType: "audio/wav",
    downloadName: "drums_preview.wav",
    disposition: "inline",
  },
  events: {
    fileName: "events.json",
    contentType: "application/json",
    downloadName: "events.json",
    disposition: "attachment",
  },
  summary: {
    fileName: "result.json",
    contentType: "application/json",
    downloadName: "result.json",
    disposition: "attachment",
  },
} as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId") || "";
  const kind = (searchParams.get("kind") || "") as keyof typeof FILES;

  if (!isValidRunId(runId) || !(kind in FILES)) {
    return NextResponse.json({ error: "Invalid run or file request." }, { status: 400 });
  }

  const file = FILES[kind];
  const targetPath = path.join(DRUM_MIDI_ROOT, runId, file.fileName);

  try {
    const body = await readFile(targetPath);
    return new NextResponse(body, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `${file.disposition}; filename="${file.downloadName}"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Requested file was not found." }, { status: 404 });
  }
}
