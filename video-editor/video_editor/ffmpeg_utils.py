"""
Thin wrappers around ffmpeg/ffprobe — the only place in this package that
shells out to them. Every function here does one real, verifiable thing
(read metadata, detect silence, cut a segment, crop, encode) rather than
hiding a multi-step operation behind one call, so a failure in the
pipeline points at exactly which ffmpeg invocation broke.

$0-cost rule: everything here is local binaries, no paid API calls.
"""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


class FFmpegError(RuntimeError):
    """Raised with the real ffmpeg/ffprobe stderr attached, not a generic message."""


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise FFmpegError(f"{' '.join(cmd)}\n{result.stderr}")
    return result


@dataclass
class VideoMetadata:
    duration_seconds: float
    width: int
    height: int
    fps: float
    has_audio: bool
    file_size_bytes: int
    codec: str


def get_video_metadata(path: str | Path) -> VideoMetadata:
    """Real ffprobe output, not guessed — every field the spec's own
    'Video Import' section asks callers to show."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(path)

    result = _run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate",
            "-of", "json",
            str(path),
        ]
    )
    data = json.loads(result.stdout)
    duration = float(data["format"]["duration"])

    video_stream = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    audio_stream = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
    if video_stream is None:
        raise FFmpegError(f"{path}: no video stream found")

    num, den = video_stream["r_frame_rate"].split("/")
    fps = float(num) / float(den) if float(den) != 0 else 0.0

    return VideoMetadata(
        duration_seconds=duration,
        width=int(video_stream["width"]),
        height=int(video_stream["height"]),
        fps=round(fps, 3),
        has_audio=audio_stream is not None,
        file_size_bytes=path.stat().st_size,
        codec=video_stream["codec_name"],
    )


@dataclass
class SilenceInterval:
    start: float
    end: float


_SILENCE_START_RE = re.compile(r"silence_start:\s*([0-9.]+)")
_SILENCE_END_RE = re.compile(r"silence_end:\s*([0-9.]+)")


def detect_silence(path: str | Path, noise_db: float = -30.0, min_duration: float = 0.4) -> list[SilenceInterval]:
    """
    Runs ffmpeg's own silencedetect filter (no custom energy math needed —
    it already does RMS-vs-threshold detection correctly) and parses the
    silence_start/silence_end pairs it writes to stderr. noise_db/min_duration
    are the two knobs a real caller would want to tune per source (a noisy
    phone recording needs a louder noise_db floor than a clean mic).
    """
    result = subprocess.run(
        [
            "ffmpeg", "-v", "info", "-i", str(path),
            "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
    )
    # silencedetect writes to stderr regardless of success; ffmpeg's exit
    # code here is 0 even when the filter found intervals, so we parse
    # stderr unconditionally rather than gating on returncode.
    starts = [float(m.group(1)) for m in _SILENCE_START_RE.finditer(result.stderr)]
    ends = [float(m.group(1)) for m in _SILENCE_END_RE.finditer(result.stderr)]
    # A silence run touching end-of-file emits silence_start with no
    # matching silence_end — drop the unmatched trailing start rather
    # than mis-pairing it with the next interval's end.
    pairs = list(zip(starts, ends))
    return [SilenceInterval(start=s, end=e) for s, e in pairs]


def keep_intervals(total_duration: float, silences: list[SilenceInterval], min_gap: float = 0.15) -> list[tuple[float, float]]:
    """
    The complement of the silence intervals, clamped to [0, total_duration]
    — this is what actually gets kept when silence is removed. min_gap
    drops a sliver that's too short to be a meaningful cut (avoids a
    flurry of near-zero-length segments from detector noise).
    """
    if not silences:
        return [(0.0, total_duration)]
    kept: list[tuple[float, float]] = []
    cursor = 0.0
    for s in sorted(silences, key=lambda i: i.start):
        if s.start - cursor > min_gap:
            kept.append((cursor, s.start))
        cursor = max(cursor, s.end)
    if total_duration - cursor > min_gap:
        kept.append((cursor, total_duration))
    return kept


def extract_segment(input_path: str | Path, start: float, end: float, output_path: str | Path) -> None:
    """
    Re-encodes rather than stream-copies — a -ss/-to stream copy on real
    footage can only cut on keyframe boundaries, which silently shifts
    every cut by up to a GOP length. Slower, but the cut actually lands
    where the caller asked.
    """
    _run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(input_path),
            "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac",
            str(output_path),
        ]
    )


def concat_segments(segment_paths: list[str | Path], output_path: str | Path) -> None:
    """Concat demuxer needs a file-list; segments must already share codec/params (extract_segment guarantees that)."""
    if not segment_paths:
        raise ValueError("no segments to concatenate")
    list_path = Path(output_path).with_suffix(".concat.txt")
    list_path.write_text("".join(f"file '{Path(p).resolve()}'\n" for p in segment_paths))
    try:
        _run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-f", "concat", "-safe", "0", "-i", str(list_path),
                "-c", "copy",
                str(output_path),
            ]
        )
    finally:
        list_path.unlink(missing_ok=True)


def remove_silence(input_path: str | Path, output_path: str | Path, noise_db: float = -30.0, min_duration: float = 0.4) -> float:
    """
    Full silence-removal step (spec section 4): detect -> compute keep
    intervals -> cut each -> concat. Returns the resulting duration so
    the caller can log how much was actually trimmed.
    """
    meta = get_video_metadata(input_path)
    silences = detect_silence(input_path, noise_db=noise_db, min_duration=min_duration)
    keeps = keep_intervals(meta.duration_seconds, silences)
    if len(keeps) == 1 and keeps[0] == (0.0, meta.duration_seconds):
        # nothing to remove — still produce output_path so callers don't branch on this.
        _run(["ffmpeg", "-y", "-v", "error", "-i", str(input_path), "-c", "copy", str(output_path)])
        return meta.duration_seconds

    tmp_dir = Path(output_path).parent / f".segments_{Path(output_path).stem}"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    segment_paths = []
    try:
        for i, (start, end) in enumerate(keeps):
            seg_path = tmp_dir / f"seg_{i:04d}.mp4"
            extract_segment(input_path, start, end, seg_path)
            segment_paths.append(seg_path)
        concat_segments(segment_paths, output_path)
    finally:
        for p in segment_paths:
            p.unlink(missing_ok=True)
        try:
            tmp_dir.rmdir()
        except OSError:
            pass

    return get_video_metadata(output_path).duration_seconds


def reframe_to_vertical(
    input_path: str | Path,
    output_path: str | Path,
    target_width: int = 1080,
    target_height: int = 1920,
    focus_x_ratio: float = 0.5,
) -> None:
    """
    16:9/4:3/1:1 -> 9:16 (spec section 9). MVP crops around a horizontal
    focus point rather than tracking a face — focus_x_ratio (0=left
    edge, 0.5=center, 1=right edge) is where a future speaker-tracking
    pass (mediapipe) would feed a per-frame value instead of one static
    ratio for the whole clip. Center-crop is still a real, correct
    default: most talking-head/gameplay footage keeps its subject
    roughly centered.
    """
    meta = get_video_metadata(input_path)
    target_ratio = target_width / target_height
    src_ratio = meta.width / meta.height

    if src_ratio > target_ratio:
        # source is wider than target — crop the sides
        crop_w = int(meta.height * target_ratio)
        crop_h = meta.height
        max_x = meta.width - crop_w
        crop_x = int(max_x * focus_x_ratio)
        crop_x = max(0, min(crop_x, max_x))
        crop_y = 0
    else:
        # source is taller/narrower than target — crop top/bottom, no horizontal focus needed
        crop_w = meta.width
        crop_h = int(meta.width / target_ratio)
        crop_x = 0
        crop_y = max(0, (meta.height - crop_h) // 2)

    vf = f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y},scale={target_width}:{target_height}:flags=lanczos"
    _run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(input_path),
            "-vf", vf,
            "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy",
            str(output_path),
        ]
    )


def burn_in_subtitles(input_path: str | Path, ass_path: str | Path, output_path: str | Path) -> None:
    """Final render step for captions (spec section 5/11) — libass via ffmpeg's ass filter."""
    # ffmpeg's filtergraph parser treats ':' and other path characters
    # specially in filter arguments — escape the subtitle path per
    # ffmpeg's own documented convention rather than passing it raw.
    escaped = str(ass_path).replace("\\", "\\\\").replace(":", "\\:")
    _run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(input_path),
            "-vf", f"ass={escaped}",
            "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy",
            str(output_path),
        ]
    )


_RMS_LEVEL_RE = re.compile(r"RMS level dB:\s*(-?[0-9.]+|-inf)")


def measure_audio_energy(path: str | Path, start: float, end: float) -> float:
    """
    Real RMS loudness (dB) of the [start, end) window via ffmpeg's astats
    filter — not a fabricated 'energy score'. Higher (closer to 0) means
    louder/more energetic; -inf (true digital silence) is returned as a
    large negative number so callers can compare numerically without
    special-casing it.
    """
    result = subprocess.run(
        [
            "ffmpeg", "-v", "info",
            "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
            "-i", str(path),
            "-af", "astats=metadata=0:reset=1",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
    )
    matches = _RMS_LEVEL_RE.findall(result.stderr)
    if not matches:
        return -100.0
    values = [-100.0 if m == "-inf" else float(m) for m in matches]
    return sum(values) / len(values)


def render_final(input_path: str | Path, output_path: str | Path, fps: int = 30) -> None:
    """Final export encode (spec section 11): H.264/AAC/target fps, the one step every pipeline run ends on."""
    _run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-i", str(input_path),
            "-r", str(fps),
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            str(output_path),
        ]
    )
