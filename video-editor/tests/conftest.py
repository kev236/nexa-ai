"""
Builds a real synthetic test video once per test session — real ffmpeg
test-pattern video muxed with real espeak-ng-synthesized speech and real
silence gaps — rather than committing generated binary samples to the
repo. Every test that touches this fixture is exercising real ffmpeg/
ffprobe/espeak-ng subprocess calls, not mocks, except where a module's
own docstring says otherwise (transcribe.py — see its test's comment).
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import pytest


@pytest.fixture(scope="session")
def sample_video(tmp_path_factory) -> Path:
    tmp_dir = tmp_path_factory.mktemp("samples")

    speech_specs = [
        ("speech1.wav", "You will not believe what happened next. I was scrolling through my phone."),
        ("speech2.wav", "So here is the thing nobody tells you about starting a business."),
        ("speech3.wav", "Wait, is that even legal? This changes everything I thought I knew."),
    ]
    wav_paths = []
    for name, text in speech_specs:
        path = tmp_dir / name
        subprocess.run(["espeak-ng", "-v", "en-us", "-s", "165", "-w", str(path), text], check=True, capture_output=True)
        wav_paths.append(path)

    audio_path = tmp_dir / "full_audio.wav"
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(wav_paths[0]), "-i", str(wav_paths[1]), "-i", str(wav_paths[2]),
            "-filter_complex",
            "[0:a]apad=pad_dur=2.5[a0];[1:a]apad=pad_dur=2.5[a1];[2:a]apad=pad_dur=1[a2];[a0][a1][a2]concat=n=3:v=0:a=1[aout]",
            "-map", "[aout]", str(audio_path),
        ],
        check=True, capture_output=True,
    )

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
        check=True, capture_output=True, text=True,
    )
    duration = float(probe.stdout.strip())

    video_path = tmp_dir / "source.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "lavfi", "-i", f"testsrc2=size=640x360:rate=30:duration={duration:.3f}",
            "-i", str(audio_path),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
            str(video_path),
        ],
        check=True, capture_output=True,
    )
    return video_path
