#!/usr/bin/env python3
"""
Merge multiple WAV (PCM) TTS audio clips into a single seamless WAV file.
Uses only Python's standard library (wave, argparse, json, os, sys).
"""

import argparse
import json
import os
import sys
import wave


def merge_wav_files(input_paths: list[str], output_path: str, silence_ms: int = 180) -> dict:
    if not input_paths:
        raise ValueError("No input WAV files provided.")

    valid_paths = [p for p in input_paths if p and os.path.isfile(p) and os.path.getsize(p) > 44]
    if not valid_paths:
        raise ValueError("No valid non-empty WAV files found.")

    params = None
    merged_frames: list[bytes] = []

    for idx, wav_path in enumerate(valid_paths):
        with wave.open(wav_path, "rb") as wf:
            current_params = wf.getparams()
            nchannels, sampwidth, framerate, nframes, comptype, compname = current_params

            if comptype != "NONE":
                raise ValueError(f"Unsupported compressed WAV format '{comptype}' in {wav_path}")

            if params is None:
                params = (nchannels, sampwidth, framerate, comptype, compname)
            else:
                if (nchannels, sampwidth, framerate) != params[:3]:
                    raise ValueError(
                        f"Audio parameter mismatch in {wav_path}: "
                        f"expected {params[:3]}, got {(nchannels, sampwidth, framerate)}"
                    )

            frames = wf.readframes(nframes)
            if frames:
                if idx > 0 and silence_ms > 0:
                    silence_frame_count = int(framerate * (silence_ms / 1000.0))
                    if silence_frame_count > 0:
                        merged_frames.append(b"\x00" * (silence_frame_count * nchannels * sampwidth))
                merged_frames.append(frames)

    if params is None or not merged_frames:
        raise ValueError("Failed to read audio frames from input WAV files.")

    nchannels, sampwidth, framerate, comptype, compname = params
    combined_bytes = b"".join(merged_frames)

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
        "partsMerged": len(valid_paths),
        "durationSeconds": round(duration_seconds, 3),
        "sizeBytes": size_bytes,
        "sampleRate": framerate,
        "channels": nchannels,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge WAV TTS audio clips into one WAV file.")
    parser.add_argument("--output", required=True, help="Output merged WAV file path")
    parser.add_argument("--silence-ms", type=int, default=180, help="Silence gap between parts in ms")
    parser.add_argument("inputs", nargs="+", help="Ordered list of input WAV file paths")
    args = parser.parse_args()

    try:
        result = merge_wav_files(args.inputs, args.output, max(0, args.silence_ms))
        print(json.dumps(result))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
