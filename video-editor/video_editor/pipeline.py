"""
Orchestrates the MVP pipeline end to end (spec's own "Start with an
MVP" list, steps 1-9): import -> transcribe -> detect clips -> per
selected clip: extract -> remove silence -> reframe -> captions ->
render. Every stage below is real code exercised against a real
synthetic test video with actual speech in this sandbox (see
video-editor/README.md for exactly what's verified and how) — transcribe()
is the one stage that could only be verified structurally here, not
against real audio, because huggingface.co (where faster-whisper's model
weights live) is blocked by this sandbox's network egress policy. That
is an environment limitation, not a gap in this code; verify it for real
on the first run wherever this ends up hosted.
"""
from __future__ import annotations

import shutil
from dataclasses import dataclass, field
from pathlib import Path

from .captions import STYLES, CaptionStyle, build_ass
from .clip_detector import ClipCandidate, ClipDetectorConfig, detect_clips
from .ffmpeg_utils import (
    VideoMetadata,
    burn_in_subtitles,
    extract_segment,
    get_video_metadata,
    reframe_to_vertical,
    remove_silence,
)
from .transcribe import Transcript, Word, transcribe


@dataclass
class RenderedClip:
    candidate: ClipCandidate
    output_path: Path


@dataclass
class ProjectResult:
    source_metadata: VideoMetadata
    transcript: Transcript
    candidates: list[ClipCandidate]
    rendered: list[RenderedClip] = field(default_factory=list)


def _words_in_range(transcript: Transcript, start: float, end: float) -> list[Word]:
    """Word timestamps re-zeroed onto the clip's own timeline — captions.py's build_ass expects clip-relative time, not source-relative."""
    words = []
    for w in transcript.words:
        if start <= w.start < end:
            words.append(Word(text=w.text, start=w.start - start, end=min(w.end, end) - start, probability=w.probability))
    return words


def process_video(
    source_path: str | Path,
    output_dir: str | Path,
    whisper_model_size: str = "base",
    caption_style_name: str = "bold_viral",
    detector_config: ClipDetectorConfig | None = None,
    top_n_clips: int = 5,
    target_width: int = 1080,
    target_height: int = 1920,
) -> ProjectResult:
    source_path = Path(source_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    work_dir = output_dir / "_work"
    work_dir.mkdir(exist_ok=True)

    meta = get_video_metadata(source_path)
    transcript = transcribe(source_path, model_size=whisper_model_size)
    candidates = detect_clips(str(source_path), transcript, config=detector_config, top_n=top_n_clips)

    style: CaptionStyle = STYLES[caption_style_name]
    rendered: list[RenderedClip] = []

    for i, candidate in enumerate(candidates):
        clip_id = f"clip_{i:02d}"
        raw_path = work_dir / f"{clip_id}_raw.mp4"
        no_silence_path = work_dir / f"{clip_id}_nosilence.mp4"
        vertical_path = work_dir / f"{clip_id}_vertical.mp4"
        ass_path = work_dir / f"{clip_id}.ass"
        final_path = output_dir / f"{clip_id}.mp4"

        extract_segment(source_path, candidate.start, candidate.end, raw_path)
        remove_silence(raw_path, no_silence_path)
        reframe_to_vertical(no_silence_path, vertical_path, target_width=target_width, target_height=target_height)

        words = _words_in_range(transcript, candidate.start, candidate.end)
        if words:
            build_ass(words, style, target_width, target_height, ass_path)
            burn_in_subtitles(vertical_path, ass_path, final_path)
        else:
            shutil.copyfile(vertical_path, final_path)

        rendered.append(RenderedClip(candidate=candidate, output_path=final_path))

    shutil.rmtree(work_dir, ignore_errors=True)
    return ProjectResult(source_metadata=meta, transcript=transcript, candidates=candidates, rendered=rendered)
