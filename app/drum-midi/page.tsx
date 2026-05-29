import type { Metadata } from "next";
import DrumMidiApp from "@/app/drum-midi/DrumMidiApp";

export const metadata: Metadata = {
  title: "Mix to Drum MIDI | Local Prototype",
  description:
    "Upload a full mix, isolate the drum content locally, and export a General MIDI drum track.",
};

export default function DrumMidiPage() {
  return <DrumMidiApp />;
}
