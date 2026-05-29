import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import {
  DRUM_MIDI_ROOT,
  ensureDrumMidiRoot,
  resolvePythonCommand,
  sanitizeFileExtension,
} from "@/lib/drum-midi/config";

export const runtime = "nodejs";
export const maxDuration = 300;

type ProcessorResult = {
  decoder_name: string;
  candidate_count: number;
  separation_source: string;
  requested_engine: string;
  effective_engine: string;
  tempo_bpm: number;
  total_hits: number;
  duration_seconds: number;
  class_counts: Record<string, number>;
  warnings: string[];
};

function normalizeSeparationMode(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "hybrid";
  }

  return ["auto", "hybrid", "hpss", "demucs"].includes(value) ? value : "hybrid";
}

function normalizeSensitivity(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) {
    return 0.62;
  }

  return Math.min(0.95, Math.max(0.2, parsed));
}

function normalizeEngine(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "auto";
  }

  return ["auto", "adaptive", "learned"].includes(value) ? value : "auto";
}

async function runProcessor(options: {
  inputPath: string;
  runDir: string;
  separationMode: string;
  sensitivity: number;
  engine: string;
}) {
  const pythonCommand = await resolvePythonCommand();
  const scriptPath = path.join(process.cwd(), "scripts", "drum_midi", "process.py");
  const resultPath = path.join(options.runDir, "result.json");

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(
      pythonCommand,
      [
        scriptPath,
        "--input",
        options.inputPath,
        "--outdir",
        options.runDir,
        "--separation",
        options.separationMode,
        "--sensitivity",
        options.sensitivity.toFixed(2),
        "--engine",
        options.engine,
        "--result-json",
        resultPath,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, PYTHONUTF8: "1" },
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `processor exited with code ${code}`));
    });
  });
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "Attach an audio file first." }, { status: 400 });
  }

  const separationMode = normalizeSeparationMode(formData.get("separationMode"));
  const sensitivity = normalizeSensitivity(formData.get("sensitivity"));
  const engine = normalizeEngine(formData.get("engine"));

  try {
    await ensureDrumMidiRoot();

    const runId = randomUUID();
    const runDir = path.join(DRUM_MIDI_ROOT, runId);
    await mkdir(runDir, { recursive: true });

    const extension = sanitizeFileExtension(audio.name);
    const inputPath = path.join(runDir, `input${extension}`);
    await writeFile(inputPath, Buffer.from(await audio.arrayBuffer()));

    await runProcessor({
      inputPath,
      runDir,
      separationMode,
      sensitivity,
      engine,
    });

    const resultPath = path.join(runDir, "result.json");
    const parsed = JSON.parse(await readFile(resultPath, "utf8")) as ProcessorResult;

    return NextResponse.json({
      runId,
      summary: {
        decoderName: parsed.decoder_name,
        candidateCount: parsed.candidate_count,
        separationSource: parsed.separation_source,
        requestedEngine: parsed.requested_engine,
        effectiveEngine: parsed.effective_engine,
        tempoBpm: parsed.tempo_bpm,
        totalHits: parsed.total_hits,
        durationSeconds: parsed.duration_seconds,
        classCounts: parsed.class_counts,
        warnings: parsed.warnings,
      },
      downloads: {
        midi: `/api/drum-midi/download?runId=${runId}&kind=midi`,
        preview: `/api/drum-midi/download?runId=${runId}&kind=preview`,
        events: `/api/drum-midi/download?runId=${runId}&kind=events`,
        summary: `/api/drum-midi/download?runId=${runId}&kind=summary`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Drum-to-MIDI processing failed unexpectedly.";

    const dependencyHint =
      message.includes("ModuleNotFoundError") ||
      message.includes("demucs") ||
      message.includes("TorchCodec") ||
      message.includes("torchcodec")
        ? " Run ./scripts/setup-drum-midi.sh --with-demucs for the full local stack, or ./scripts/setup-drum-midi.sh for the fallback-only setup."
        : "";

    console.error("drum-midi process failed", error);
    return NextResponse.json(
      { error: `${message}${dependencyHint}`.trim() },
      { status: 500 }
    );
  }
}
