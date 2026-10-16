#!/usr/bin/env python3
"""
VoiceText AI — Local Faster-Whisper Speech-to-Text Transcription Engine
Provides fast, highly-accurate offline transcription for Urdu, English, Hindi, Pashto, Arabic, etc.
"""

import sys
import os
import json
import argparse
from pathlib import Path

# Force UTF-8 encoding for standard I/O streams on Windows
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

# Ensure local DLL search directories for ctranslate2 runtime
try:
    import site
    for sp in site.getsitepackages():
        ct2_dir = os.path.join(sp, "ctranslate2")
        if os.path.isdir(ct2_dir) and hasattr(os, "add_dll_directory"):
            try:
                os.add_dll_directory(ct2_dir)
            except Exception:
                pass
except Exception:
    pass

LANGUAGE_MAP = {
    "ur": "ur",
    "ur-pk": "ur",
    "urdu": "ur",
    "hi": "hi",
    "hi-in": "hi",
    "hindi": "hi",
    "ps": "ps",
    "ps-af": "ps",
    "pashto": "ps",
    "ar": "ar",
    "ar-sa": "ar",
    "arabic": "ar",
    "en": "en",
    "en-us": "en",
    "en-gb": "en",
    "english": "en",
}

def normalize_language(lang_str: str | None) -> str | None:
    if not lang_str:
        return None
    cleaned = lang_str.strip().lower()
    if cleaned in ("", "auto", "detect"):
        return None
    if cleaned in LANGUAGE_MAP:
        return LANGUAGE_MAP[cleaned]
    prefix = cleaned.split("-")[0].split("_")[0]
    return LANGUAGE_MAP.get(prefix, prefix)

def main():
    parser = argparse.ArgumentParser(description="VoiceText AI Whisper STT Bridge")
    parser.add_argument("audio_path", help="Path to input audio file (WAV, MP3, WebM, OGG)")
    parser.add_argument("--language", "-l", default=None, help="Target language code (e.g. ur, en, hi)")
    parser.add_argument("--model", "-m", default=None, help="Whisper model size (tiny, base, small, medium)")
    args = parser.parse_args()

    audio_path = Path(args.audio_path)
    if not audio_path.is_file():
        print(json.dumps({
            "success": False,
            "error": f"Audio file not found: {args.audio_path}"
        }, ensure_ascii=False))
        sys.exit(1)

    model_name = args.model or os.environ.get("WHISPER_MODEL", "base")
    target_lang = normalize_language(args.language)

    try:
        from faster_whisper import WhisperModel

        # CPU int8 quantization gives optimal performance & minimal memory
        model = WhisperModel(model_name, device="cpu", compute_type="int8")

        transcribe_kwargs = {
            "beam_size": 5,
            "best_of": 5,
            "condition_on_previous_text": False,
            "temperature": 0.0,
        }
        if target_lang:
            transcribe_kwargs["language"] = target_lang

        segments, info = model.transcribe(str(audio_path), **transcribe_kwargs)

        collected = []
        total_duration = 0.0
        for seg in segments:
            collected.append(seg.text)
            if seg.end > total_duration:
                total_duration = seg.end

        transcription_text = "".join(collected).strip()
        detected_lang = info.language if info else (target_lang or "ur")

        result = {
            "success": True,
            "text": transcription_text,
            "language": detected_lang,
            "duration": round(total_duration, 2),
            "model": model_name
        }
        print(json.dumps(result, ensure_ascii=False))

    except Exception as exc:
        print(json.dumps({
            "success": False,
            "error": str(exc),
            "model": model_name
        }, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
