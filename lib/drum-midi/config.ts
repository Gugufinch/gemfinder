import { access, mkdir } from "fs/promises";
import path from "path";

export const DRUM_MIDI_ROOT = path.join(process.cwd(), "tmp", "drum-midi");

export async function ensureDrumMidiRoot() {
  await mkdir(DRUM_MIDI_ROOT, { recursive: true });
}

export async function resolvePythonCommand() {
  const candidates = [
    path.join(process.cwd(), ".venv", "bin", "python3"),
    path.join(process.cwd(), ".venv", "bin", "python"),
    "python3",
    "python",
  ];

  for (const candidate of candidates) {
    if (candidate === "python3" || candidate === "python") {
      return candidate;
    }

    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return "python3";
}

export function sanitizeFileExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  if (!extension || extension.length > 10) {
    return ".wav";
  }

  return extension.replace(/[^a-z0-9.]/g, "") || ".wav";
}

export function isValidRunId(runId: string) {
  return /^[a-f0-9-]{8,}$/i.test(runId);
}
