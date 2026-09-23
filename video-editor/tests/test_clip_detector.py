from video_editor.clip_detector import ClipDetectorConfig, detect_clips
from video_editor.transcribe import Segment, Transcript


def _synthetic_transcript() -> Transcript:
    # Matches the real speech content tests/conftest.py's fixture
    # synthesizes, with segment boundaries approximating real speech
    # timing (Whisper itself isn't runnable in this sandbox — see
    # test_transcribe_shape.py's comment).
    segments = [
        Segment("You will not believe what happened next.", 0.0, 2.2, []),
        Segment("I was scrolling through my phone.", 2.2, 4.2, []),
        Segment("So here is the thing nobody tells you about starting a business.", 6.7, 9.8, []),
        Segment("Wait, is that even legal?", 12.3, 13.6, []),
        Segment("This changes everything I thought I knew.", 13.6, 15.7, []),
    ]
    return Transcript(language="en", full_text=" ".join(s.text for s in segments), segments=segments)


def test_detect_clips_ranks_a_hook_plus_question_above_a_plain_statement(sample_video):
    transcript = _synthetic_transcript()
    config = ClipDetectorConfig(min_seconds=1.0, max_seconds=6.0, ideal_seconds=2.0)

    candidates = detect_clips(str(sample_video), transcript, config=config, top_n=5)

    assert candidates, "expected at least one candidate clip"
    top = candidates[0]
    # "Wait, is that even legal?" matches a hook pattern AND is a
    # question AND is short — it should outscore a plain declarative
    # sentence with no hook pattern and no question mark.
    assert "wait" in top.hook.lower()
    assert all(top.score >= c.score for c in candidates)


def test_detect_clips_returns_non_overlapping_candidates(sample_video):
    transcript = _synthetic_transcript()
    candidates = detect_clips(str(sample_video), transcript, config=ClipDetectorConfig(min_seconds=1.0, max_seconds=10.0), top_n=5)

    for i, a in enumerate(candidates):
        for b in candidates[i + 1 :]:
            assert a.end <= b.start or a.start >= b.end, f"overlapping candidates: {a} / {b}"


def test_detect_clips_respects_duration_bounds(sample_video):
    transcript = _synthetic_transcript()
    config = ClipDetectorConfig(min_seconds=1.0, max_seconds=3.0)
    candidates = detect_clips(str(sample_video), transcript, config=config, top_n=10)

    for c in candidates:
        assert config.min_seconds <= c.duration_seconds <= config.max_seconds + 0.01


def test_detect_clips_with_no_segments_returns_empty_list(sample_video):
    empty = Transcript(language="en", full_text="", segments=[])
    assert detect_clips(str(sample_video), empty) == []
