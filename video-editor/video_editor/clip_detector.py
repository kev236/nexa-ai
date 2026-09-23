"""
Clip candidate detection and scoring (spec section 3) — entirely local,
$0-cost: real audio RMS energy (ffmpeg_utils.measure_audio_energy) plus
transcript-text heuristics. No LLM call required for the core pipeline;
a richer, optional LLM-based re-scorer (e.g. via the existing
@nexa-ai/permission-engine Claude integration) is a natural later
adapter, per the spec's own "paid APIs may exist as optional adapters
later" rule — not built here.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .ffmpeg_utils import measure_audio_energy
from .transcribe import Segment, Transcript

MIN_CLIP_SECONDS = 15.0
MAX_CLIP_SECONDS = 90.0
IDEAL_CLIP_SECONDS = 40.0

# Real, inspectable word lists — not a black box. A caller can pass their
# own via ClipDetectorConfig instead of these defaults.
DEFAULT_HOOK_PATTERNS = [
    r"\byou (will|won'?t) (not )?believe\b",
    r"\bwait\b",
    r"\bhere'?s the thing\b",
    r"\bnobody tells you\b",
    r"\bis that even\b",
    r"\bwhat if\b",
    r"\bthe truth is\b",
    r"\bi (can'?t|couldn'?t) believe\b",
]
DEFAULT_INTENSITY_WORDS = [
    "never", "always", "insane", "crazy", "shocking", "unbelievable",
    "changes everything", "hardest part", "nobody", "everyone",
]


@dataclass
class ClipDetectorConfig:
    hook_patterns: list[str] = None  # type: ignore[assignment]
    intensity_words: list[str] = None  # type: ignore[assignment]
    keywords: list[str] = None  # type: ignore[assignment]
    min_seconds: float = MIN_CLIP_SECONDS
    max_seconds: float = MAX_CLIP_SECONDS
    ideal_seconds: float = IDEAL_CLIP_SECONDS

    def __post_init__(self):
        if self.hook_patterns is None:
            self.hook_patterns = DEFAULT_HOOK_PATTERNS
        if self.intensity_words is None:
            self.intensity_words = DEFAULT_INTENSITY_WORDS
        if self.keywords is None:
            self.keywords = []


@dataclass
class ClipCandidate:
    start: float
    end: float
    text: str
    score: int  # 0-100
    hook: str
    reason: str
    duration_seconds: float

    def __post_init__(self):
        self.duration_seconds = round(self.end - self.start, 2)


def _candidate_windows(segments: list[Segment], min_seconds: float, max_seconds: float) -> list[list[Segment]]:
    """
    Groups consecutive Whisper segments into candidate windows between
    min/max duration, always starting and ending on a real segment
    boundary — this is what the spec's 'beginning/end completeness'
    criterion means in practice: a candidate clip never starts or ends
    mid-sentence, because segment boundaries already are sentence-ish
    boundaries (Whisper's own segmentation).
    """
    windows: list[list[Segment]] = []
    n = len(segments)
    for i in range(n):
        # A single segment longer than max_seconds on its own can't form
        # any valid window starting here (every window starting at i
        # only ever grows longer than this) — skip it outright rather
        # than silently emitting an over-length candidate, which is the
        # bug this comment replaces: the old single-segment fallback
        # below checked only min_seconds, never max_seconds.
        if segments[i].end - segments[i].start > max_seconds:
            continue
        window = [segments[i]]
        duration = segments[i].end - segments[i].start
        if duration >= min_seconds:
            windows.append(list(window))
        j = i + 1
        while j < n:
            candidate_duration = segments[j].end - segments[i].start
            if candidate_duration > max_seconds:
                break
            window.append(segments[j])
            duration = candidate_duration
            if duration >= min_seconds:
                windows.append(list(window))
            j += 1
    return windows


def _hook_text(segments: list[Segment]) -> str:
    return segments[0].text.strip()


def score_candidate(video_path: str, segments: list[Segment], config: ClipDetectorConfig) -> ClipCandidate:
    start = segments[0].start
    end = segments[-1].end
    text = " ".join(s.text.strip() for s in segments)
    lower = text.lower()

    hook_text = _hook_text(segments)
    hook_matched = any(re.search(p, hook_text.lower()) for p in config.hook_patterns)
    hook_score = 25 if hook_matched else 8

    question_count = text.count("?")
    exclaim_count = text.count("!")
    intensity_hits = sum(1 for w in config.intensity_words if w in lower)
    word_count = max(1, len(text.split()))
    emotion_density = (question_count + exclaim_count + intensity_hits) / word_count * 100
    emotion_score = min(25, round(emotion_density * 6))

    keyword_hits = sum(1 for k in config.keywords if k.lower() in lower)
    keyword_score = min(15, keyword_hits * 5)

    duration = end - start
    duration_delta = abs(duration - config.ideal_seconds) / config.ideal_seconds
    duration_score = max(0, round(15 * (1 - min(1.0, duration_delta))))

    # Real audio energy, not a placeholder — a candidate whose speaker is
    # audibly flat/quiet throughout scores lower here even if the text
    # looks hooky on paper.
    energy_db = measure_audio_energy(video_path, start, end)
    # -50dB..-15dB is a reasonable real-speech range; map to 0-20.
    energy_score = max(0, min(20, round((energy_db + 50) / 35 * 20)))

    total = hook_score + emotion_score + keyword_score + duration_score + energy_score
    total = max(0, min(100, total))

    reasons = []
    if hook_matched:
        reasons.append(f"opens with a hook pattern ({hook_text[:60]!r})")
    if question_count:
        reasons.append(f"{question_count} question(s)")
    if intensity_hits:
        reasons.append(f"{intensity_hits} intensity keyword(s)")
    if not reasons:
        reasons.append("no strong hook detected — scored mainly on energy/duration fit")
    reason = "; ".join(reasons) + f"; audio RMS {energy_db:.1f}dB; {duration:.1f}s"

    return ClipCandidate(start=start, end=end, text=text, score=total, hook=hook_text, reason=reason, duration_seconds=duration)


def detect_clips(video_path: str, transcript: Transcript, config: ClipDetectorConfig | None = None, top_n: int = 5) -> list[ClipCandidate]:
    """
    Spec section 3's 'return multiple candidate clips, TrendRush picks
    the highest-scoring' — sorted best-first, deduplicated so heavily
    overlapping windows (a natural side effect of the sliding-window
    generation above) don't crowd out distinct moments.
    """
    config = config or ClipDetectorConfig()
    windows = _candidate_windows(transcript.segments, config.min_seconds, config.max_seconds)
    if not windows:
        return []

    scored = [score_candidate(video_path, w, config) for w in windows]
    scored.sort(key=lambda c: c.score, reverse=True)

    selected: list[ClipCandidate] = []
    for candidate in scored:
        overlaps = any(not (candidate.end <= s.start or candidate.start >= s.end) for s in selected)
        if not overlaps:
            selected.append(candidate)
        if len(selected) >= top_n:
            break
    return selected
