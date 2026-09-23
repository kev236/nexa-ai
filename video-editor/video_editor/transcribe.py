"""
Local Whisper transcription via faster-whisper (CTranslate2) — CPU-only
in this environment (no GPU detected), which is slow relative to a GPU
box but real: no paid transcription API, per the $0-cost rule. Model
size is a real speed/accuracy tradeoff a caller should be able to pick,
not hardcoded.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from faster_whisper import WhisperModel

_model_cache: dict[str, WhisperModel] = {}


def _get_model(model_size: str) -> WhisperModel:
    # Loading a Whisper model is the slow part (seconds to tens of
    # seconds even for "tiny"/"base" on CPU) — cached per process so a
    # batch run transcribing many clips only pays that cost once.
    if model_size not in _model_cache:
        _model_cache[model_size] = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _model_cache[model_size]


@dataclass
class Word:
    text: str
    start: float
    end: float
    probability: float


@dataclass
class Segment:
    text: str
    start: float
    end: float
    words: list[Word] = field(default_factory=list)


@dataclass
class Transcript:
    language: str
    full_text: str
    segments: list[Segment]

    @property
    def words(self) -> list[Word]:
        return [w for seg in self.segments for w in seg.words]


def transcribe(path: str | Path, model_size: str = "base") -> Transcript:
    """
    Word-level timestamps + sentence segmentation (spec section 2) —
    word_timestamps=True is what makes faster-whisper return per-word
    start/end instead of just per-segment, which captions.py's
    word-by-word highlighting and clip_detector.py's speech-rate
    scoring both need.
    """
    model = _get_model(model_size)
    segments_iter, info = model.transcribe(str(path), word_timestamps=True)

    segments: list[Segment] = []
    full_text_parts: list[str] = []
    for seg in segments_iter:
        words = [Word(text=w.word.strip(), start=w.start, end=w.end, probability=w.probability) for w in (seg.words or [])]
        segments.append(Segment(text=seg.text.strip(), start=seg.start, end=seg.end, words=words))
        full_text_parts.append(seg.text.strip())

    return Transcript(language=info.language, full_text=" ".join(full_text_parts), segments=segments)
