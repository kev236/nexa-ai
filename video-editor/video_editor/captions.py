"""
Burned-in, word-by-word highlighted captions (spec section 5) as an ASS
(.ass) subtitle file rendered via ffmpeg's libass integration
(ffmpeg_utils.burn_in_subtitles) — no paid API, standard local tooling.
Word-level timing comes straight from transcribe.py's Whisper output.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .transcribe import Word

MAX_WORDS_PER_LINE_DEFAULT = 4


@dataclass
class CaptionStyle:
    name: str
    font: str
    font_size: int
    primary_color: str  # ASS &HBBGGRR& (note: BGR, not RGB — libass/ASS convention)
    highlight_color: str
    outline_color: str
    outline_width: int
    position_margin_v: int  # distance from the bottom (or top) edge, ASS units
    max_words_per_line: int
    uppercase: bool
    alignment: int = 2  # ASS \an alignment: 2 = bottom-center


# A handful of real presets, not placeholders — every field above is
# used by _build_ass below. More can be added without touching any
# other module, per the spec's own "create unlimited styles" ask —
# these are the seed set the JSON-style-system section can layer on
# top of later (a style just needs to be a CaptionStyle, however it
# got constructed).
STYLES: dict[str, CaptionStyle] = {
    "bold_viral": CaptionStyle(
        name="Bold Viral", font="Arial Black", font_size=88,
        primary_color="&H00FFFFFF", highlight_color="&H0000D7FF",  # white -> gold (BGR)
        outline_color="&H00000000", outline_width=6,
        position_margin_v=180, max_words_per_line=3, uppercase=True,
    ),
    "minimal": CaptionStyle(
        name="Minimal", font="Helvetica", font_size=58,
        primary_color="&H00FFFFFF", highlight_color="&H00FFFFFF",
        outline_color="&H00000000", outline_width=2,
        position_margin_v=140, max_words_per_line=5, uppercase=False,
    ),
    "podcast": CaptionStyle(
        name="Podcast", font="Georgia", font_size=52,
        primary_color="&H00E6E6E6", highlight_color="&H0000A5FF",  # light gray -> orange
        outline_color="&H001A1A1A", outline_width=3,
        position_margin_v=160, max_words_per_line=6, uppercase=False,
    ),
}


def _group_words(words: list[Word], max_per_line: int) -> list[list[Word]]:
    return [words[i : i + max_per_line] for i in range(0, len(words), max_per_line)]


def _fmt_ts(seconds: float) -> str:
    """ASS timestamp: H:MM:SS.cc (centiseconds, not milliseconds)."""
    cs = round(seconds * 100)
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, c = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def _ass_header(style: CaptionStyle, video_width: int, video_height: int) -> str:
    return f"""[Script Info]
ScriptType: v4.00+
PlayResX: {video_width}
PlayResY: {video_height}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{style.font},{style.font_size},{style.primary_color},&H000000FF,{style.outline_color},&H00000000,1,0,0,0,100,100,0,0,1,{style.outline_width},0,{style.alignment},40,40,{style.position_margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def _line_text(line: list[Word], active_index: int, style: CaptionStyle) -> str:
    """One \\k-karaoke-free approach: render the active word in highlight_color via inline override, rest in primary."""
    parts = []
    for i, w in enumerate(line):
        text = w.text.upper() if style.uppercase else w.text
        # ASS has no way to escape a literal '{' or '}' inside a Text
        # field — any '{...}' is always parsed as an override block, the
        # same mechanism the \c color highlight below relies on. A
        # transcribed word that happened to contain either character
        # (rare, but not impossible from Whisper's output) would corrupt
        # that structure for the rest of the line. Stripped rather than
        # escaped, since this format genuinely has no escape for them.
        text = text.replace("{", "").replace("}", "")
        if i == active_index:
            parts.append(f"{{\\c{style.highlight_color}}}{text}{{\\c{style.primary_color}}}")
        else:
            parts.append(text)
    return " ".join(parts)


def build_ass(words: list[Word], style: CaptionStyle, video_width: int, video_height: int, output_path: str | Path) -> Path:
    """
    Word-by-word highlighting (spec section 5): one ASS event per word,
    covering that word's own [start, end) window, with the rest of its
    line rendered alongside it so the reader sees the whole line while
    the active word pops in highlight_color — the standard "TikTok-style"
    caption look.
    """
    output_path = Path(output_path)
    lines = _group_words(words, style.max_words_per_line)

    events = []
    for line in lines:
        for i, word in enumerate(line):
            if word.end <= word.start:
                continue  # a zero/negative-duration word from a bad timestamp — skip rather than emit an invalid event
            text = _line_text(line, i, style)
            events.append(f"Dialogue: 0,{_fmt_ts(word.start)},{_fmt_ts(word.end)},Default,,0,0,0,,{text}")

    output_path.write_text(_ass_header(style, video_width, video_height) + "\n".join(events) + "\n")
    return output_path
