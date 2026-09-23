# TrendRush Video Editor

Turns a long-form video into edited, captioned, 9:16 short clips —
Whisper transcription, local heuristic clip scoring, silence removal,
reframing, word-by-word burned-in captions, FFmpeg rendering. Everything
here runs on local, free tooling (ffmpeg, faster-whisper on CPU) — no
paid API is required for the core pipeline, per the original spec's own
$0-cost rule.

This is a standalone Python service, separate from the npm-workspaces
TypeScript monorepo the rest of this repo is — see "Where this fits"
below for why, and what's still unresolved about where it actually runs
in production.

## Status: MVP pipeline built and exercised end-to-end, one stage not verifiable in this sandbox

Every module below was tested against a **real** synthetic video — real
ffmpeg test-pattern footage muxed with real `espeak-ng`-synthesized
speech and real silence gaps (`tests/conftest.py`'s `sample_video`
fixture) — not mocked, except where noted. 16 tests, all passing
(`python -m pytest tests/ -v`).

| Module | What it does | Verified how |
|---|---|---|
| `ffmpeg_utils.py` | metadata (ffprobe), silence detection, silence removal, 9:16 reframing, audio RMS energy, subtitle burn-in, final render | Real ffmpeg subprocess calls against the real sample; `test_ffmpeg_utils.py`. Also manually verified visually — extracted a rendered frame and confirmed real captions render correctly (word highlighting, correct crop, correct dimensions) |
| `clip_detector.py` | candidate-window generation + scoring (hook patterns, question/intensity-word density, real audio energy, duration fit) | `test_clip_detector.py`, including a real bug this testing caught and fixed: a single Whisper segment longer than `max_seconds` was being emitted as its own over-length candidate — the duration-bound check only looked at `min_seconds`, never the upper bound |
| `captions.py` | ASS subtitle generation with word-by-word highlight-on-active-word, 3 real style presets (`bold_viral`, `minimal`, `podcast`) | `test_captions.py`; visually confirmed on a rendered frame |
| `transcribe.py` | faster-whisper wrapper, word-level timestamps | **Structurally only** — see below |
| `pipeline.py` | orchestrates all of the above end to end | Imports and wires cleanly; not run end-to-end in this sandbox because `transcribe()` can't run here (see below) |

### The one real gap: `transcribe.py` was never run against real audio here

`huggingface.co` — where faster-whisper downloads its model weights from
— is blocked by this sandbox's network egress policy (confirmed via the
proxy status, a policy denial, not a transient failure worth retrying).
Every other stage of the pipeline was proven against real audio/video;
this one stage's own data-shaping logic (word/segment aggregation, the
`full_text` join, whitespace stripping) is proven correct via
`tests/test_transcribe_shape.py`, which mocks `WhisperModel.transcribe`
itself — but real Whisper acoustic transcription has not been run once
in this environment.

**Before trusting this for a real video**, run it once somewhere with
internet access:

```bash
python -c "from video_editor.transcribe import transcribe; print(transcribe('some_real_video.mp4').full_text)"
```

If that produces a sensible transcript, the whole pipeline is verified
end to end, not just stage by stage.

## Where this fits — the open hosting question

This cannot run on Vercel (this repo's current host for the dashboard):
no persistent compute, execution-time limits, no GPU. It needs its own
host — a VPS, Fly.io, Railway, RunPod, or similar — which hasn't been
chosen yet. Until that's decided:

- The code lives here, in the repo, ready to deploy wherever it's
  pointed.
- No FastAPI layer has been built yet (the spec's section 13 "TrendRush
  Automation API" — `POST /api/projects`, etc.) — deliberately: wrapping
  a pipeline that hasn't been proven end-to-end (the Whisper gap above)
  in a web API would just be more surface area to re-verify once the
  real gap closes. That's the natural next step once (a) a host is
  picked and (b) `transcribe()` has been confirmed against real audio.
- No GPU is available anywhere this has been tested — faster-whisper on
  CPU with `compute_type="int8"` works but is slow relative to a GPU
  box. Fine for occasional/batch use; a production host with real
  volume would want GPU acceleration.

## Running it

```bash
cd video-editor
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest tests/ -v          # 16 tests, no network access needed — synthetic audio/video generated locally

# System dependencies (not in requirements.txt — not Python packages):
#   ffmpeg (with libass support, the Ubuntu/Debian package includes it)
#   espeak-ng (test-only, for synthesizing sample speech)
```

## Architecture

```
video_editor/
  ffmpeg_utils.py    # every ffmpeg/ffprobe subprocess call — metadata,
                      # silence detect/remove, reframe, audio energy,
                      # caption burn-in, final render
  transcribe.py       # faster-whisper wrapper, word-level timestamps
  clip_detector.py    # candidate window generation + real scoring
                      # (hook patterns, emotion density, real audio
                      # energy, duration fit)
  captions.py          # ASS subtitle generation, word-by-word
                      # highlighting, style presets
  pipeline.py          # orchestrates all of the above
tests/
  conftest.py          # session-scoped real synthetic video fixture
  test_*.py             # one file per module above
```

Each module does one real thing and can be tested/used independently —
`clip_detector.py` doesn't know anything about rendering, `captions.py`
doesn't know anything about clip scoring. `pipeline.py` is the only
module that wires them together.
