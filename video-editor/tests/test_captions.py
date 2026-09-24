from video_editor.captions import STYLES, build_ass
from video_editor.transcribe import Word


def test_build_ass_writes_one_event_per_word(tmp_path):
    words = [
        Word(text="Wait,", start=0.0, end=0.4, probability=0.9),
        Word(text="is", start=0.4, end=0.6, probability=0.9),
        Word(text="that", start=0.6, end=0.8, probability=0.9),
        Word(text="legal?", start=0.8, end=1.3, probability=0.9),
    ]
    output_path = tmp_path / "captions.ass"

    build_ass(words, STYLES["bold_viral"], 1080, 1920, output_path)

    content = output_path.read_text()
    assert "[Script Info]" in content
    assert "PlayResX: 1080" in content
    assert "PlayResY: 1920" in content
    dialogue_lines = [line for line in content.splitlines() if line.startswith("Dialogue:")]
    assert len(dialogue_lines) == len(words)


def test_build_ass_skips_zero_duration_words(tmp_path):
    words = [
        Word(text="ok", start=1.0, end=1.0, probability=0.5),  # zero duration - should be skipped
        Word(text="real", start=1.0, end=1.5, probability=0.9),
    ]
    output_path = tmp_path / "captions.ass"

    build_ass(words, STYLES["minimal"], 1080, 1920, output_path)

    dialogue_lines = [line for line in output_path.read_text().splitlines() if line.startswith("Dialogue:")]
    assert len(dialogue_lines) == 1


def test_build_ass_uppercases_when_the_style_asks_for_it(tmp_path):
    words = [Word(text="hello", start=0.0, end=0.5, probability=0.9)]
    output_path = tmp_path / "captions.ass"

    build_ass(words, STYLES["bold_viral"], 1080, 1920, output_path)  # bold_viral.uppercase == True

    assert "HELLO" in output_path.read_text()


def test_build_ass_strips_literal_braces_from_word_text(tmp_path):
    # ASS has no escape for a literal '{'/'}' in a Text field - any
    # "{...}" is always parsed as an override block, the same mechanism
    # the \c color-highlight override relies on. A transcribed word
    # containing one (rare, but a real possible Whisper output) must not
    # be allowed to corrupt that structure for the rest of the line.
    words = [Word(text="{laughs}", start=0.0, end=0.5, probability=0.9)]
    output_path = tmp_path / "captions.ass"

    build_ass(words, STYLES["minimal"], 1080, 1920, output_path)

    dialogue_line = next(line for line in output_path.read_text().splitlines() if line.startswith("Dialogue:"))
    # Every '{' remaining on the line must belong to a real \c override
    # tag this code itself emits, never to the word's own source text.
    assert dialogue_line.count("{") == dialogue_line.count("{\\c")
    assert "laughs" in dialogue_line


def test_build_ass_respects_max_words_per_line(tmp_path):
    words = [Word(text=f"word{i}", start=i * 0.3, end=i * 0.3 + 0.25, probability=0.9) for i in range(7)]
    style = STYLES["minimal"]  # max_words_per_line = 5
    output_path = tmp_path / "captions.ass"

    build_ass(words, style, 1080, 1920, output_path)

    dialogue_lines = [line for line in output_path.read_text().splitlines() if line.startswith("Dialogue:")]
    # first 5 words form line 1 (5 events, each showing all 5 words with one highlighted),
    # remaining 2 words form line 2 (2 events)
    assert len(dialogue_lines) == 7
    first_line_event = dialogue_lines[0]
    assert first_line_event.count("word") == 5  # all 5 words of the first line appear in each of its own events
