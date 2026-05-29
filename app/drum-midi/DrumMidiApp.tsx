"use client";

import {
  startTransition,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import styles from "./DrumMidiApp.module.css";

type SeparationMode = "hybrid" | "hpss" | "demucs";
type EngineMode = "auto" | "adaptive" | "learned";

type ProcessResult = {
  runId: string;
  summary: {
    decoderName: string;
    candidateCount: number;
    separationSource: string;
    requestedEngine: string;
    effectiveEngine: string;
    tempoBpm: number;
    totalHits: number;
    durationSeconds: number;
    classCounts: Record<string, number>;
    warnings: string[];
  };
  downloads: {
    midi: string;
    preview: string;
    events: string;
    summary: string;
  };
};

const SEPARATION_OPTIONS: Array<{
  value: SeparationMode;
  label: string;
  detail: string;
}> = [
  {
    value: "hybrid",
    label: "Hybrid (Recommended)",
    detail: "Run Demucs plus HPSS rescue and merge the event streams. This is the best mode when Demucs alone over-cleans the hits.",
  },
  {
    value: "hpss",
    label: "HPSS only",
    detail: "Fast fallback mode. Good for quick passes, but materially weaker on dense full mixes.",
  },
  {
    value: "demucs",
    label: "Demucs only",
    detail: "Highest-accuracy separation path. Requires Demucs plus TorchCodec in the project venv.",
  },
];

const NOTE_MAP = [
  "Kick -> 36",
  "Snare -> 38",
  "Closed Hat -> 42",
  "Open Hat -> 46",
  "Low Tom -> 45",
  "Crash -> 49",
];

const ENGINE_OPTIONS: Array<{
  value: EngineMode;
  label: string;
  detail: string;
}> = [
  {
    value: "auto",
    label: "Auto",
    detail: "Use a learned checkpoint if one has been trained locally. Otherwise fall back to the adaptive decoder.",
  },
  {
    value: "adaptive",
    label: "Adaptive baseline",
    detail: "Track-adaptive clustering and rule-based decoding. Stable default while you build training data.",
  },
  {
    value: "learned",
    label: "Learned classifier",
    detail: "Requires a trained checkpoint at models/drum-midi/learned-hit-v1.pt or an explicit --model-checkpoint run.",
  },
];

export default function DrumMidiApp() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [separationMode, setSeparationMode] = useState<SeparationMode>("hybrid");
  const [engineMode, setEngineMode] = useState<EngineMode>("auto");
  const [sensitivity, setSensitivity] = useState(0.62);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  const selectedMode = useMemo(
    () => SEPARATION_OPTIONS.find((option) => option.value === separationMode),
    [separationMode]
  );
  const selectedEngine = useMemo(
    () => ENGINE_OPTIONS.find((option) => option.value === engineMode),
    [engineMode]
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setAudioFile(nextFile);
    setError(null);
    setResult(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!audioFile) {
      setError("Choose an audio file first.");
      return;
    }

    const body = new FormData();
    body.set("audio", audioFile);
    body.set("separationMode", separationMode);
    body.set("engine", engineMode);
    body.set("sensitivity", sensitivity.toFixed(2));

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch("/api/drum-midi/process", {
        method: "POST",
        body,
      });

      const payload = (await response.json().catch(() => null)) as
        | ProcessResult
        | { error?: string }
        | null;

      if (!response.ok || !payload || !("runId" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error || "Processing failed." : "Processing failed.");
      }

      startTransition(() => {
        setResult(payload);
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Processing failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Local Drum Transcription</p>
          <h1>Turn a full mix into a drum MIDI sketch without sending audio to the cloud.</h1>
          <p className={styles.intro}>
            This prototype isolates the drum layer, rescues transients across multiple separator views, runs an adaptive kit-aware decoder on the hits,
            maps them to General MIDI, and gives you both a downloadable `.mid` file and a preview of the extracted stem.
          </p>
        </div>

        <div className={styles.pipelineCard}>
          <span className={styles.pipelineLabel}>Pipeline</span>
          <ol>
            <li>Upload a song, loop, or bounce.</li>
            <li>Build a hybrid drum view from Demucs plus HPSS rescue, or force a single separator if you want.</li>
            <li>Detect transient events and decode them with a track-adaptive classifier.</li>
            <li>Export a GM drum MIDI file for Ableton, Logic, FL, or REAPER.</li>
          </ol>
        </div>
      </section>

      <section className={styles.grid}>
        <form className={styles.panel} onSubmit={handleSubmit}>
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelEyebrow}>Upload</p>
              <h2>Process a mix</h2>
            </div>
            <span className={styles.badge}>Local</span>
          </div>

          <label className={styles.fileField}>
            <span>Audio file</span>
            <input
              type="file"
              accept="audio/*,.wav,.mp3,.aiff,.flac,.m4a"
              onChange={handleFileChange}
            />
            <strong>{audioFile ? audioFile.name : "Choose a mix or drum bounce"}</strong>
            <small>
              Short loops process fastest. Full songs work, but the best results come from the Demucs path on dense mixes.
            </small>
          </label>

          <label className={styles.control}>
            <span>Separation mode</span>
            <select
              value={separationMode}
              onChange={(event) => setSeparationMode(event.target.value as SeparationMode)}
            >
              {SEPARATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>{selectedMode?.detail}</small>
          </label>

          <label className={styles.control}>
            <span>Decoder engine</span>
            <select
              value={engineMode}
              onChange={(event) => setEngineMode(event.target.value as EngineMode)}
            >
              {ENGINE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small>{selectedEngine?.detail}</small>
          </label>

          <label className={styles.control}>
            <span>Sensitivity</span>
            <input
              type="range"
              min="0.2"
              max="0.95"
              step="0.01"
              value={sensitivity}
              onChange={(event) => setSensitivity(Number(event.target.value))}
            />
            <small>
              {sensitivity.toFixed(2)}. Lower values catch more ghost notes but also more false positives.
            </small>
          </label>

          <button className={styles.submitButton} type="submit" disabled={isProcessing}>
            {isProcessing ? "Processing..." : "Build MIDI"}
          </button>

          {error ? <p className={styles.error}>{error}</p> : null}
        </form>

        <aside className={styles.sidebar}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Output</p>
                <h2>Current mapping</h2>
              </div>
            </div>

            <div className={styles.mappingList}>
              {NOTE_MAP.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>

            <p className={styles.caption}>
              This is still a transcription sketch, not a finished drum score, but the decoder now adapts to the isolated kit instead of using one static rule set.
            </p>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.panelEyebrow}>Setup</p>
                <h2>Optional upgrade path</h2>
              </div>
            </div>

            <p className={styles.caption}>
              If you run
              <code> ./scripts/setup-drum-midi.sh --with-demucs </code>
              the app can use the full hybrid path. If Demucs alone sounds worse on your material, leave the app on
              <code> Hybrid </code>
              so HPSS can rescue missing transients.
            </p>
          </div>
        </aside>
      </section>

      {result ? (
        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <div>
              <p className={styles.panelEyebrow}>Results</p>
              <h2>Run {result.runId.slice(0, 8)}</h2>
            </div>
            <div className={styles.downloads}>
              <a href={result.downloads.midi}>Download MIDI</a>
              <a href={result.downloads.events}>Events JSON</a>
              <a href={result.downloads.summary}>Run summary</a>
            </div>
          </div>

          <div className={styles.metrics}>
            <article>
              <span>Separation</span>
              <strong>{result.summary.separationSource}</strong>
            </article>
            <article>
              <span>Tempo</span>
              <strong>{result.summary.tempoBpm.toFixed(1)} BPM</strong>
            </article>
            <article>
              <span>Total hits</span>
              <strong>{result.summary.totalHits}</strong>
            </article>
            <article>
              <span>Duration</span>
              <strong>{result.summary.durationSeconds.toFixed(1)}s</strong>
            </article>
          </div>

          <p className={styles.caption}>
            Decoder:
            <code> {result.summary.decoderName} </code>
            · engine:
            <code> {result.summary.effectiveEngine} </code>
            · candidates:
            <code> {result.summary.candidateCount} </code>
            · final hits:
            <code> {result.summary.totalHits} </code>
          </p>

          <div className={styles.summaryGrid}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelEyebrow}>Hit counts</p>
                  <h2>Detected lanes</h2>
                </div>
              </div>

              <div className={styles.classCounts}>
                {Object.entries(result.summary.classCounts).map(([label, count]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.panelEyebrow}>Preview</p>
                  <h2>Extracted drums</h2>
                </div>
              </div>

              <audio className={styles.audioPlayer} controls src={result.downloads.preview}>
                Your browser does not support audio playback.
              </audio>

              {result.summary.warnings.length ? (
                <div className={styles.warningList}>
                  {result.summary.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : (
                <p className={styles.caption}>
                  No processing warnings. If the MIDI is too sparse or too busy, adjust the sensitivity and rerun.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
