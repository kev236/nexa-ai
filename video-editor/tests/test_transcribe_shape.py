"""
huggingface.co is blocked by this sandbox's network egress policy (confirmed
via the proxy status, not a retry-able failure) — faster-whisper can't
download real model weights here, so real acoustic transcription can't be
verified in this environment. This test mocks WhisperModel.transcribe to
prove transcribe()'s own data-shaping logic (word/segment aggregation,
full_text join, .strip()) is correct independent of that — it is NOT a
substitute for testing against a real model once this runs somewhere
with internet access.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from video_editor.transcribe import transcribe


def _fake_whisper_word(word: str, start: float, end: float, probability: float = 0.95):
    return SimpleNamespace(word=word, start=start, end=end, probability=probability)


def _fake_whisper_segment(text: str, start: float, end: float, words):
    return SimpleNamespace(text=text, start=start, end=end, words=words)


def test_transcribe_shapes_segments_and_words_correctly(tmp_path):
    fake_segments = [
        _fake_whisper_segment(
            " Hello world.",
            0.0, 1.2,
            [_fake_whisper_word(" Hello", 0.0, 0.6), _fake_whisper_word(" world.", 0.6, 1.2)],
        ),
        _fake_whisper_segment(
            " This is real.",
            1.5, 2.8,
            [_fake_whisper_word(" This", 1.5, 1.8), _fake_whisper_word(" is", 1.8, 2.0), _fake_whisper_word(" real.", 2.0, 2.8)],
        ),
    ]
    fake_info = SimpleNamespace(language="en")

    dummy_audio = tmp_path / "dummy.wav"
    dummy_audio.write_bytes(b"not a real wav - the model call itself is mocked")

    with patch("video_editor.transcribe.WhisperModel") as MockModel:
        MockModel.return_value.transcribe.return_value = (fake_segments, fake_info)
        result = transcribe(dummy_audio, model_size="tiny")

    assert result.language == "en"
    assert result.full_text == "Hello world. This is real."
    assert len(result.segments) == 2
    assert result.segments[0].text == "Hello world."
    assert len(result.words) == 5
    assert result.words[0].text == "Hello" and result.words[0].start == 0.0 and result.words[0].end == 0.6
    # word text is stripped of the leading space faster-whisper includes
    assert all(not w.text.startswith(" ") for w in result.words)
