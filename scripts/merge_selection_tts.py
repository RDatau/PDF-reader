#!/usr/bin/env python3
"""
Merge multiple Selected-Text WAV (PCM) TTS audio clips into a single seamless WAV file.
Specifically handles Selected Text parts (e.g. "Judul - Hal 2 - Pilihan 01",
"Judul - Hal 2 - Pilihan 02", ...) -> "Judul - Hal 2 - Pilihan.wav".
Uses only Python's standard library (argparse, json, os, re, sys, wave).
"""

import argparse
import json
import os
import re
import sys
import wave


PILIHAN_PART_RE = re.compile(r"pilihan\s*(\d+)", re.IGNORECASE)


def _natural_selection_sort_key(path: str) -> tuple[int, str]:
    name = os.path.basename(path)
    match = PILIHAN_PART_RE.search(name)
    if match:
        return (int(match.group(1)), name.lower())
    return (sys.maxsize, name.lower())


def collect_input_paths(inputs: list[str], input_dir: str | None) -> list[str]:
    paths: list[str] = []

    if input_dir:
        if not os.path.isdir(input_dir):
            raise ValueError(f"Input directory not found: {input_dir}")
        dir_files = [
            os.path.join(input_dir, fname)
            for fname in os.listdir(input_dir)
            if fname.lower().endswith(".wav")
            and not re.search(r"-\s*pilihan\.wav$", fname, re.IGNORECASE)
        ]
        dir_files.sort(key=_natural_selection_sort_key)
        paths.extend(dir_files)

    if inputs:
        paths.extend(inputs)

    return [p for p in paths if p and os.path.isfile(p) and os.path.getsize(p) > 44]


def merge_selection_wav_files(
    input_paths: list[str],
    output_path: str,
    silence_ms: int = 220,
    title: str | None = None,
) -> dict:
    if not input_paths:
        raise ValueError("No valid non-empty selection WAV files provided.")

    params = None
    merged_frames: list[bytes] = []
    merged_count = 0

    for wav_path in input_paths:
        with wave.open(wav_path, "rb") as wf:
            nchannels, sampwidth, framerate, nframes, comptype, compname = wf.getparams()

            if comptype != "NONE":
                raise ValueError(f"Unsupported compressed WAV format '{comptype}' in {wav_path}")

            if params is None:
                params = (nchannels, sampwidth, framerate, comptype, compname)
            elif (nchannels, sampwidth, framerate) != params[:3]:
                raise ValueError(
                    f"Audio parameter mismatch in {wav_path}: "
                    f"expected {params[:3]}, got {(nchannels, sampwidth, framerate)}"
                )

            frames = wf.readframes(nframes)
            if frames:
                if merged_count > 0 and silence_ms > 0:
                    silence_frame_count = int(framerate * (silence_ms / 1000.0))
                    if silence_frame_count > 0:
                        merged_frames.append(
                            b"\x00" * (silence_frame_count * nchannels * sampwidth)
                        )
                merged_frames.append(frames)
                merged_count += 1

    if params is None or not merged_frames:
        raise ValueError("Failed to read audio frames from selection WAV files.")

    nchannels, sampwidth, framerate, comptype, compname = params
    combined_bytes = b"".join(merged_frames)

    output_dir = os.path.dirname(os.path.abspath(output_path))
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    with wave.open(output_path, "wb") as out_wf:
        out_wf.setnchannels(nchannels)
        out_wf.setsampwidth(sampwidth)
        out_wf.setframerate(framerate)
        out_wf.setcomptype(comptype, compname)
        out_wf.writeframes(combined_bytes)

    bytes_per_second = framerate * nchannels * sampwidth
    duration_seconds = (len(combined_bytes) / bytes_per_second) if bytes_per_second > 0 else 0.0
    size_bytes = os.path.getsize(output_path)

    return {
        "ok": True,
        "mode": "selection",
        "title": title or os.path.splitext(os.path.basename(output_path))[0],
        "partsMerged": merged_count,
        "durationSeconds": round(duration_seconds, 3),
        "sizeBytes": size_bytes,
        "sampleRate": framerate,
        "channels": nchannels,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Merge Selected-Text WAV TTS clips (Pilihan 01, Pilihan 02, ...) "
            "into a single combined Pilihan WAV file."
        )
    )
    parser.add_argument("--output", required=True, help="Output merged WAV file path")
    parser.add_argument(
        "--silence-ms",
        type=int,
        default=220,
        help="Silence gap between selected text clips in ms (default: 220)",
    )
    parser.add_argument(
        "--input-dir",
        default=None,
        help="Optional directory containing Pilihan 01, Pilihan 02, ... WAV files",
    )
    parser.add_argument(
        "--title",
        default=None,
        help="Optional merged clip title metadata (e.g. 'Mama Haus nih - Hal 2 - Pilihan')",
    )
    parser.add_argument("inputs", nargs="*", help="Ordered list of input selection WAV file paths")
    args = parser.parse_args()

    try:
        valid_paths = collect_input_paths(args.inputs, args.input_dir)
        result = merge_selection_wav_files(
            valid_paths,
            args.output,
            max(0, args.silence_ms),
            args.title,
        )
        print(json.dumps(result))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "mode": "selection", "error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
