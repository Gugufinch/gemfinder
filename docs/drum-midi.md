# Drum MIDI Prototype

This route adds a local full-mix drum-to-MIDI prototype at `/drum-midi`.

## What it does

- uploads an audio file through the Next.js UI
- isolates the drum energy locally
- detects drum onsets and classifies them into General MIDI drum notes
- can switch between the adaptive baseline and a locally trained learned classifier
- exports:
  - `drums.mid`
  - `drums_preview.wav`
  - `events.json`
  - `result.json`

## Local setup

```bash
./scripts/setup-drum-midi.sh --with-demucs
npm run dev
```

Then open:

```text
http://localhost:3000/drum-midi
```

## Separation modes

- `hybrid`: runs Demucs plus HPSS rescue and merges the detected events
- `auto`: legacy alias of `hybrid`
- `hpss`: always uses harmonic-percussive source separation
- `demucs`: requires Demucs and fails if it is missing

## Optional upgrade

If you skipped the high-accuracy install, add it later with:

```bash
.venv/bin/pip install demucs torchcodec
```

The route will automatically use Demucs when `auto` mode is selected and the Demucs stack is available.

## Learned classifier workflow

The app now accepts a decoder engine:

- `auto`: use a learned checkpoint if present, else fall back to the adaptive baseline
- `adaptive`: current track-adaptive clustering decoder
- `learned`: require a trained checkpoint

Default checkpoint path:

```text
models/drum-midi/learned-hit-v1.pt
```

Build training data from corrected labels:

```bash
.venv/bin/python scripts/drum_midi/export_dataset.py \
  --input path/to/song.wav \
  --labels path/to/corrected.mid \
  --output data/drum-midi/train.jsonl \
  --append
```

Train a checkpoint:

```bash
.venv/bin/python scripts/drum_midi/train.py \
  --dataset data/drum-midi/train.jsonl
```

Evaluate it:

```bash
.venv/bin/python scripts/drum_midi/eval.py \
  --dataset data/drum-midi/train.jsonl \
  --checkpoint models/drum-midi/learned-hit-v1.pt
```

Once that checkpoint exists, the web app can use `Auto` or `Learned classifier`.
