from video_editor.ffmpeg_utils import (
    detect_silence,
    get_video_metadata,
    keep_intervals,
    measure_audio_energy,
    reframe_to_vertical,
    remove_silence,
)


def test_get_video_metadata_reads_real_ffprobe_output(sample_video):
    meta = get_video_metadata(sample_video)
    assert meta.width == 640
    assert meta.height == 360
    assert meta.fps == 30.0
    assert meta.has_audio is True
    assert meta.duration_seconds > 5
    assert meta.file_size_bytes > 0


def test_detect_silence_finds_the_real_gaps_between_speech_clips(sample_video):
    silences = detect_silence(sample_video)
    # 3 speech clips with silence padding between/after them -> at least 2 real gaps detected
    assert len(silences) >= 2
    for s in silences:
        assert s.end > s.start


def test_keep_intervals_is_the_complement_of_silence():
    from video_editor.ffmpeg_utils import SilenceInterval

    keeps = keep_intervals(30.0, [SilenceInterval(5.0, 8.0), SilenceInterval(20.0, 22.0)])
    assert keeps == [(0.0, 5.0), (8.0, 20.0), (22.0, 30.0)]


def test_keep_intervals_with_no_silence_keeps_the_whole_clip():
    assert keep_intervals(10.0, []) == [(0.0, 10.0)]


def test_remove_silence_actually_shortens_the_video(sample_video, tmp_path):
    original = get_video_metadata(sample_video)
    output_path = tmp_path / "no_silence.mp4"
    new_duration = remove_silence(sample_video, output_path)

    assert new_duration < original.duration_seconds
    assert get_video_metadata(output_path).duration_seconds == new_duration


def test_reframe_to_vertical_produces_correct_target_dimensions(sample_video, tmp_path):
    output_path = tmp_path / "vertical.mp4"
    reframe_to_vertical(sample_video, output_path, target_width=1080, target_height=1920)

    meta = get_video_metadata(output_path)
    assert meta.width == 1080
    assert meta.height == 1920


def test_measure_audio_energy_distinguishes_speech_from_real_silence(sample_video):
    silences = detect_silence(sample_video)
    assert silences, "fixture must contain at least one detected silence gap for this test to mean anything"
    silence_window = silences[0]

    speech_energy = measure_audio_energy(sample_video, 0, 1.0)
    silence_energy = measure_audio_energy(sample_video, silence_window.start + 0.1, silence_window.end - 0.1)

    assert speech_energy > silence_energy
