import json
import math
import os
import re
import shlex
import shutil
import subprocess
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence


ROOT = Path(__file__).resolve().parents[1]
DEMO_OUT = Path(os.environ.get("DEMO_OUT", "/tmp/keepscape-demo")).expanduser()
NARRATION_FILE = Path(
    os.environ.get("NARRATION_FILE", str(ROOT / "docs" / "DEMO_NARRATION.md")),
).expanduser()
VOICE_SOURCE_RAW = os.environ.get("DEMO_VOICE_DIR", "").strip()
VOICE_SOURCE = Path(VOICE_SOURCE_RAW).expanduser() if VOICE_SOURCE_RAW else None

RAW = DEMO_OUT / "raw"
WORK = DEMO_OUT / "render-work"
VOICE = WORK / "voice"
SEGMENTS = WORK / "segments"
FINAL_MP4 = DEMO_OUT / "keepscape-demo.mp4"
FINAL_SRT = DEMO_OUT / "keepscape-demo.srt"
STAGED_MP4 = DEMO_OUT / ".keepscape-demo.rendering.mp4"
STAGED_SRT = DEMO_OUT / ".keepscape-demo.rendering.srt"
VOICE_ONLY_MP4 = DEMO_OUT / ".keepscape-demo.voice-only.mp4"
CONCAT_FILE = WORK / "segments.ffconcat"

SEGMENT_NUMBERS = tuple(range(1, 9))
SAY_VOICE = "Samantha"
SAY_RATE = 140
TAIL_PAUSE_SECONDS = 0.9
MAX_CLONED_FRAME_SECONDS = 0.35
# The proof-card animation masks the GitHub receipt until late in segment 07.
# Preserve enough of that shot for judges to inspect the actual JSON before the
# closing card, even when a concise voice take finishes early.
MIN_SEGMENT_DURATIONS = {7: 10.32}
MAX_FINAL_DURATION_SECONDS = 179.0
# Leave room for frame and AAC timestamp rounding while preserving the hard 179s gate.
ENCODE_SAFETY_MARGIN_SECONDS = 0.75
MAX_PLANNED_DURATION_SECONDS = MAX_FINAL_DURATION_SECONDS - ENCODE_SAFETY_MARGIN_SECONDS
VIDEO_WIDTH = 1920
VIDEO_HEIGHT = 1080
VIDEO_FPS = 25
SUBTITLE_WRAP_WIDTH = 76
SUBTITLE_LINE_WIDTH = 42
MAX_SUBTITLE_LINES = 2
MIN_SUBTITLE_WORDS = 4
MIN_SUBTITLE_DURATION_MS = 1_200

SECTION_HEADING_RE = re.compile(r"^##\s+(0[1-8])(?:\s+|$)")
ANY_HEADING_RE = re.compile(r"^#{1,6}\s+")
WORD_RE = re.compile(r"\b[\w]+(?:[-'’][\w]+)*\b", re.UNICODE)


@dataclass
class DemoSegment:
    number: int
    text: str
    raw_path: Path
    text_path: Path
    voice_path: Path
    rendered_path: Path
    raw_duration: float = 0.0
    voice_duration: float = 0.0
    target_duration: float = 0.0
    rendered_duration: float = 0.0


@dataclass(frozen=True)
class SubtitleCue:
    start_ms: int
    end_ms: int
    text: str


def run(command: Sequence[str], *, capture_output: bool = False) -> subprocess.CompletedProcess[str]:
    print(f"$ {shlex.join(command)}")
    try:
        return subprocess.run(
            list(command),
            check=True,
            capture_output=capture_output,
            text=True,
        )
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or "").strip()
        suffix = f"\n{detail}" if detail else ""
        raise RuntimeError(f"Command failed: {shlex.join(command)}{suffix}") from error


def require_tool(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"Required tool is unavailable: {name}")


def clean_markdown(lines: list[str]) -> str:
    text = " ".join(line.strip() for line in lines if line.strip())
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"[*_~]+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_narration(path: Path) -> dict[int, str]:
    if not path.is_file():
        raise RuntimeError(f"Narration file does not exist: {path}")

    section_lines: dict[int, list[str]] = {}
    current: int | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        section_match = SECTION_HEADING_RE.match(line)
        if section_match:
            current = int(section_match.group(1))
            if current in section_lines:
                raise RuntimeError(f"Narration section {current:02d} appears more than once in {path}")
            section_lines[current] = []
            continue
        if ANY_HEADING_RE.match(line):
            current = None
            continue
        if current is not None:
            section_lines[current].append(line)

    expected = set(SEGMENT_NUMBERS)
    actual = set(section_lines)
    if actual != expected:
        missing = ", ".join(f"{number:02d}" for number in sorted(expected - actual)) or "none"
        extra = ", ".join(f"{number:02d}" for number in sorted(actual - expected)) or "none"
        raise RuntimeError(f"Narration must contain sections 01–08 exactly once; missing={missing}, extra={extra}")

    narration = {number: clean_markdown(section_lines[number]) for number in SEGMENT_NUMBERS}
    empty = [number for number, text in narration.items() if not text]
    if empty:
        raise RuntimeError(f"Narration sections are empty: {', '.join(f'{number:02d}' for number in empty)}")
    return narration


def find_raw_clips() -> dict[int, Path]:
    if not RAW.is_dir():
        raise RuntimeError(f"Raw clip directory does not exist: {RAW}")

    all_clips = sorted(RAW.glob("0[1-8]-*.webm"))
    if len(all_clips) != 8:
        raise RuntimeError(f"Expected exactly 8 numbered WebM clips in {RAW}; found {len(all_clips)}")

    result: dict[int, Path] = {}
    for number in SEGMENT_NUMBERS:
        matches = sorted(RAW.glob(f"{number:02d}-*.webm"))
        if len(matches) != 1:
            raise RuntimeError(
                f"Expected exactly one raw clip for section {number:02d}; found {len(matches)}",
            )
        result[number] = matches[0]
    return result


def probe(path: Path) -> dict[str, Any]:
    completed = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=index,codec_type,codec_name,width,height",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
    )
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"ffprobe returned invalid JSON for {path}") from error


def media_duration(probe_result: dict[str, Any], path: Path) -> float:
    raw_duration = probe_result.get("format", {}).get("duration")
    try:
        duration = float(raw_duration)
    except (TypeError, ValueError) as error:
        raise RuntimeError(f"ffprobe found no valid duration for {path}") from error
    if not math.isfinite(duration) or duration <= 0:
        raise RuntimeError(f"ffprobe found a non-positive duration for {path}: {raw_duration}")
    return duration


def probe_duration(path: Path) -> float:
    return media_duration(probe(path), path)


def validate_raw_clip(path: Path) -> float:
    result = probe(path)
    video_streams = [stream for stream in result.get("streams", []) if stream.get("codec_type") == "video"]
    if len(video_streams) != 1:
        raise RuntimeError(f"Raw clip must contain exactly one video stream: {path}")
    return media_duration(result, path)


def validate_h264_aac(path: Path) -> float:
    result = probe(path)
    streams = result.get("streams", [])
    videos = [stream for stream in streams if stream.get("codec_type") == "video"]
    audios = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if len(videos) != 1 or videos[0].get("codec_name") != "h264":
        raise RuntimeError(f"Expected one H.264 video stream in {path}")
    if videos[0].get("width") != VIDEO_WIDTH or videos[0].get("height") != VIDEO_HEIGHT:
        raise RuntimeError(
            f"Expected {VIDEO_WIDTH}x{VIDEO_HEIGHT} video in {path}; "
            f"found {videos[0].get('width')}x{videos[0].get('height')}",
        )
    if len(audios) != 1 or audios[0].get("codec_name") != "aac":
        raise RuntimeError(f"Expected one AAC audio stream in {path}")
    return media_duration(result, path)


def estimated_voice_seconds(text: str) -> float:
    word_count = len(WORD_RE.findall(text))
    return word_count * 60.0 / SAY_RATE


def preflight_narration_budget(narration: dict[int, str]) -> None:
    estimate = sum(estimated_voice_seconds(text) for text in narration.values())
    estimated_total = estimate + TAIL_PAUSE_SECONDS * len(SEGMENT_NUMBERS)
    if estimated_total >= MAX_PLANNED_DURATION_SECONDS:
        raise RuntimeError(
            f"Estimated narration is too long: {estimated_total:.2f}s including tail pauses; "
            f"budget is {MAX_PLANNED_DURATION_SECONDS:.2f}s before encoding",
        )


def synthesize_voice(segment: DemoSegment) -> None:
    segment.text_path.write_text(f"{segment.text}\n", encoding="utf-8")
    if VOICE_SOURCE is not None:
        if not segment.voice_path.is_file():
            raise RuntimeError(f"External voice clip does not exist: {segment.voice_path}")
        source_text_path = VOICE_SOURCE / f"{segment.number:02d}.txt"
        if not source_text_path.is_file():
            raise RuntimeError(f"External voice transcript does not exist: {source_text_path}")
        source_text = re.sub(r"\s+", " ", source_text_path.read_text(encoding="utf-8")).strip()
        if source_text != segment.text:
            raise RuntimeError(
                f"External voice transcript {source_text_path} does not match narration section "
                f"{segment.number:02d}",
            )
        segment.voice_duration = probe_duration(segment.voice_path)
        segment.target_duration = max(
            segment.voice_duration + TAIL_PAUSE_SECONDS,
            MIN_SEGMENT_DURATIONS.get(segment.number, 0.0),
        )
        return

    segment.voice_path.unlink(missing_ok=True)
    run(
        [
            "say",
            "-v",
            SAY_VOICE,
            "-r",
            str(SAY_RATE),
            "-f",
            str(segment.text_path),
            "-o",
            str(segment.voice_path),
        ],
    )
    segment.voice_duration = probe_duration(segment.voice_path)
    segment.target_duration = max(
        segment.voice_duration + TAIL_PAUSE_SECONDS,
        MIN_SEGMENT_DURATIONS.get(segment.number, 0.0),
    )


def render_segment(segment: DemoSegment) -> None:
    target = segment.target_duration
    video_filters = [
        f"scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos",
        f"pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black",
        "setsar=1",
        f"fps={VIDEO_FPS}",
    ]
    if segment.raw_duration < target:
        shortfall = target - segment.raw_duration
        if shortfall > MAX_CLONED_FRAME_SECONDS:
            raise RuntimeError(
                f"Raw clip {segment.number:02d} is {shortfall:.3f}s shorter than its narration window; "
                f"re-record the shot instead of freezing its final frame",
            )
        freeze_duration = shortfall + (1.0 / VIDEO_FPS)
        video_filters.append(f"tpad=stop_mode=clone:stop_duration={freeze_duration:.6f}")
    video_filters.extend([f"trim=duration={target:.6f}", "setpts=PTS-STARTPTS"])

    audio_filters = [
        "loudnorm=I=-16:LRA=11:TP=-1.5",
        f"apad=pad_dur={TAIL_PAUSE_SECONDS:.6f}",
        f"atrim=duration={target:.6f}",
        "asetpts=PTS-STARTPTS",
        "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo",
    ]
    filter_graph = f"[0:v]{','.join(video_filters)}[v];[1:a]{','.join(audio_filters)}[a]"

    segment.rendered_path.unlink(missing_ok=True)
    run(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(segment.raw_path),
            "-i",
            str(segment.voice_path),
            "-filter_complex",
            filter_graph,
            "-map",
            "[v]",
            "-map",
            "[a]",
            "-t",
            f"{target:.6f}",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "16",
            "-pix_fmt",
            "yuv420p",
            "-profile:v",
            "high",
            "-level:v",
            "4.1",
            "-r",
            str(VIDEO_FPS),
            "-g",
            str(VIDEO_FPS * 2),
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-video_track_timescale",
            "90000",
            "-movflags",
            "+faststart",
            str(segment.rendered_path),
        ],
    )
    segment.rendered_duration = validate_h264_aac(segment.rendered_path)


def concat_escape(path: Path) -> str:
    return path.resolve().as_posix().replace("'", "'\\''")


def concatenate_segments(segments: list[DemoSegment], output_path: Path) -> None:
    CONCAT_FILE.write_text(
        "ffconcat version 1.0\n"
        + "".join(f"file '{concat_escape(segment.rendered_path)}'\n" for segment in segments),
        encoding="utf-8",
    )
    output_path.unlink(missing_ok=True)
    run(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(CONCAT_FILE),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(output_path),
        ],
    )


def add_ambient_soundtrack(input_path: Path, output_path: Path, duration: float) -> None:
    """Lay a quiet, original ambient bed under the narration.

    The bed is synthesized at render time, so the release has no third-party
    music rights or attribution dependency. Its gain is deliberately low: it
    joins segment boundaries and removes dead-air cuts without competing with
    the spoken demo.
    """
    fade_out_start = max(0.0, duration - 2.5)
    tone = (
        "aevalsrc="
        "0.014*(sin(2*PI*65.406*t)+0.58*sin(2*PI*98.000*t)+"
        "0.32*sin(2*PI*164.814*t))*(0.78+0.22*sin(2*PI*0.045*t))"
        f":s=48000:d={duration:.6f}"
    )
    air = f"anoisesrc=color=pink:amplitude=0.010:sample_rate=48000:duration={duration:.6f}"
    filter_graph = (
        f"[1:a]highpass=f=42,lowpass=f=1200,volume=0.48,"
        f"afade=t=in:st=0:d=2.5,afade=t=out:st={fade_out_start:.6f}:d=2.5[tone];"
        f"[2:a]highpass=f=180,lowpass=f=3200,volume=0.12,"
        f"afade=t=in:st=0:d=1.8,afade=t=out:st={fade_out_start:.6f}:d=2.5[air];"
        "[tone][air]amix=inputs=2:normalize=0[bed];"
        "[0:a][bed]amix=inputs=2:normalize=0:weights='1 1',"
        "alimiter=limit=0.94,"
        "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a]"
    )

    output_path.unlink(missing_ok=True)
    run(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(input_path),
            "-f",
            "lavfi",
            "-i",
            tone,
            "-f",
            "lavfi",
            "-i",
            air,
            "-filter_complex",
            filter_graph,
            "-map",
            "0:v:0",
            "-map",
            "[a]",
            "-t",
            f"{duration:.6f}",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(output_path),
        ],
    )


def subtitle_chunks(text: str) -> list[str]:
    chunks = textwrap.wrap(
        text.strip(),
        width=SUBTITLE_WRAP_WIDTH,
        break_long_words=False,
        break_on_hyphens=False,
    )
    word_chunks = [chunk.split() for chunk in chunks if chunk]

    # textwrap can strand a one-word tail. Rebalance it with a neighbour so
    # short phrases do not flash as isolated subtitle cues.
    index = 0
    while len(word_chunks) > 1 and index < len(word_chunks):
        current = word_chunks[index]
        if len(WORD_RE.findall(" ".join(current))) >= MIN_SUBTITLE_WORDS:
            index += 1
            continue

        if index > 0:
            previous = word_chunks[index - 1]
            while (
                len(WORD_RE.findall(" ".join(current))) < MIN_SUBTITLE_WORDS
                and len(previous) > 1
                and len(WORD_RE.findall(" ".join(previous[:-1]))) >= MIN_SUBTITLE_WORDS
            ):
                current.insert(0, previous.pop())
            if len(WORD_RE.findall(" ".join(current))) < MIN_SUBTITLE_WORDS:
                previous.extend(current)
                word_chunks.pop(index)
                index = max(0, index - 1)
                continue
        else:
            following = word_chunks[1]
            while (
                len(WORD_RE.findall(" ".join(current))) < MIN_SUBTITLE_WORDS
                and len(following) > 1
                and len(WORD_RE.findall(" ".join(following[1:]))) >= MIN_SUBTITLE_WORDS
            ):
                current.append(following.pop(0))
            if len(WORD_RE.findall(" ".join(current))) < MIN_SUBTITLE_WORDS:
                current.extend(following)
                word_chunks.pop(1)
        index += 1

    return [" ".join(words) for words in word_chunks if words]


def fit_subtitle_chunks(chunks: list[str], available_ms: int) -> list[str]:
    max_cues = available_ms // MIN_SUBTITLE_DURATION_MS
    if max_cues < 1:
        raise RuntimeError(
            f"Subtitle window is only {available_ms / 1000:.3f}s; "
            f"minimum cue duration is {MIN_SUBTITLE_DURATION_MS / 1000:.1f}s",
        )

    fitted = list(chunks)
    while len(fitted) > max_cues:
        merge_at = min(
            range(len(fitted) - 1),
            key=lambda index: len(fitted[index]) + len(fitted[index + 1]),
        )
        fitted[merge_at : merge_at + 2] = [f"{fitted[merge_at]} {fitted[merge_at + 1]}"]
    return fitted


def allocate_subtitle_durations_ms(weights: list[int], available_ms: int) -> list[int]:
    minimum_total = len(weights) * MIN_SUBTITLE_DURATION_MS
    if not weights or available_ms < minimum_total:
        raise RuntimeError(
            f"Cannot fit {len(weights)} subtitle cues into {available_ms / 1000:.3f}s "
            f"with a {MIN_SUBTITLE_DURATION_MS / 1000:.1f}s minimum",
        )

    total_weight = sum(weights)
    extra_ms = available_ms - minimum_total
    weighted_extra = [extra_ms * weight for weight in weights]
    extras = [value // total_weight for value in weighted_extra]
    remainder = extra_ms - sum(extras)
    remainder_order = sorted(
        range(len(weights)),
        key=lambda index: weighted_extra[index] % total_weight,
        reverse=True,
    )
    for index in remainder_order[:remainder]:
        extras[index] += 1
    return [MIN_SUBTITLE_DURATION_MS + extra for extra in extras]


def validate_subtitle_cues(cues: list[SubtitleCue], final_duration_ms: int) -> None:
    if not cues:
        raise RuntimeError("Generated subtitle cue list is empty")

    previous_end = 0
    for number, cue in enumerate(cues, start=1):
        if not cue.text.strip():
            raise RuntimeError(f"Subtitle cue {number} has no text")
        if cue.start_ms < previous_end:
            raise RuntimeError(f"Subtitle cue {number} overlaps or precedes the previous cue")
        if cue.end_ms <= cue.start_ms:
            raise RuntimeError(f"Subtitle cue {number} has a non-positive duration")
        if cue.end_ms - cue.start_ms < MIN_SUBTITLE_DURATION_MS:
            raise RuntimeError(
                f"Subtitle cue {number} is {(cue.end_ms - cue.start_ms) / 1000:.3f}s; "
                f"minimum is {MIN_SUBTITLE_DURATION_MS / 1000:.1f}s",
            )
        if cue.end_ms > final_duration_ms:
            raise RuntimeError(
                f"Subtitle cue {number} ends at {cue.end_ms / 1000:.3f}s, "
                f"after the {final_duration_ms / 1000:.3f}s video",
            )
        line_count = len(
            textwrap.wrap(
                cue.text,
                width=SUBTITLE_LINE_WIDTH,
                break_long_words=False,
                break_on_hyphens=False,
            ),
        )
        if line_count > MAX_SUBTITLE_LINES:
            raise RuntimeError(
                f"Subtitle cue {number} renders as {line_count} lines; "
                f"maximum is {MAX_SUBTITLE_LINES}",
            )
        previous_end = cue.end_ms


def build_subtitle_cues(segments: list[DemoSegment], final_duration: float) -> list[SubtitleCue]:
    final_duration_ms = round(final_duration * 1000)
    timeline_offset = 0.0
    cues: list[SubtitleCue] = []
    for segment in segments:
        segment_start_ms = round(timeline_offset * 1000)
        usable_voice_seconds = min(segment.voice_duration, segment.rendered_duration)
        segment_end_ms = min(
            final_duration_ms,
            round((timeline_offset + usable_voice_seconds) * 1000),
        )
        available_ms = segment_end_ms - segment_start_ms
        chunks = fit_subtitle_chunks(subtitle_chunks(segment.text), available_ms)
        weights = [max(1, len(WORD_RE.findall(chunk))) for chunk in chunks]
        durations = allocate_subtitle_durations_ms(weights, available_ms)

        cue_start_ms = segment_start_ms
        for chunk, duration_ms in zip(chunks, durations, strict=True):
            cue_end_ms = cue_start_ms + duration_ms
            cues.append(SubtitleCue(cue_start_ms, cue_end_ms, chunk))
            cue_start_ms = cue_end_ms
        timeline_offset += segment.rendered_duration

    validate_subtitle_cues(cues, final_duration_ms)
    return cues


def srt_timestamp(milliseconds: int) -> str:
    milliseconds = max(0, milliseconds)
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{milliseconds:03d}"


def parse_srt_timestamp(value: str) -> int:
    match = re.fullmatch(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})", value)
    if match is None:
        raise RuntimeError(f"Invalid SRT timestamp: {value}")
    hours, minutes, seconds, milliseconds = (int(part) for part in match.groups())
    if minutes >= 60 or seconds >= 60:
        raise RuntimeError(f"Invalid SRT timestamp: {value}")
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds


def validate_srt_file(
    path: Path,
    expected_cues: list[SubtitleCue],
    final_duration: float,
) -> None:
    content = path.read_text(encoding="utf-8").strip()
    if not content:
        raise RuntimeError(f"Generated subtitle file is empty: {path}")

    blocks = re.split(r"\n\s*\n", content)
    parsed_cues: list[SubtitleCue] = []
    for expected_number, block in enumerate(blocks, start=1):
        lines = block.splitlines()
        if len(lines) < 3 or lines[0] != str(expected_number):
            raise RuntimeError(f"Malformed SRT cue {expected_number} in {path}")
        timing = re.fullmatch(r"(\S+) --> (\S+)", lines[1])
        if timing is None:
            raise RuntimeError(f"Malformed SRT timing for cue {expected_number} in {path}")
        parsed_cues.append(
            SubtitleCue(
                parse_srt_timestamp(timing.group(1)),
                parse_srt_timestamp(timing.group(2)),
                " ".join(line.strip() for line in lines[2:] if line.strip()),
            ),
        )

    if len(parsed_cues) != len(expected_cues):
        raise RuntimeError(
            f"Expected {len(expected_cues)} SRT cues in {path}; found {len(parsed_cues)}",
        )
    validate_subtitle_cues(parsed_cues, round(final_duration * 1000))
    for number, (parsed, expected) in enumerate(zip(parsed_cues, expected_cues, strict=True), start=1):
        if parsed != expected:
            raise RuntimeError(f"Serialized SRT cue {number} does not match its validated source cue")


def write_srt(segments: list[DemoSegment], output_path: Path, final_duration: float) -> None:
    cues = build_subtitle_cues(segments, final_duration)
    lines: list[str] = []
    for cue_number, cue in enumerate(cues, start=1):
        lines.extend(
            [
                str(cue_number),
                f"{srt_timestamp(cue.start_ms)} --> {srt_timestamp(cue.end_ms)}",
                textwrap.fill(
                    cue.text,
                    width=SUBTITLE_LINE_WIDTH,
                    break_long_words=False,
                    break_on_hyphens=False,
                ),
                "",
            ],
        )

    output_path.unlink(missing_ok=True)
    output_path.write_text("\n".join(lines), encoding="utf-8")
    validate_srt_file(output_path, cues, final_duration)


def publish_staged_outputs() -> None:
    if not STAGED_MP4.is_file() or not STAGED_SRT.is_file():
        raise RuntimeError("Validated staged MP4 and SRT are both required before publication")

    backup_mp4 = WORK / f"previous-final-{os.getpid()}.mp4"
    backup_srt = WORK / f"previous-final-{os.getpid()}.srt"
    backup_mp4.unlink(missing_ok=True)
    backup_srt.unlink(missing_ok=True)
    published_mp4 = False
    published_srt = False
    try:
        if FINAL_MP4.exists():
            FINAL_MP4.replace(backup_mp4)
        if FINAL_SRT.exists():
            FINAL_SRT.replace(backup_srt)

        # Publish the uploadable MP4 last. Each replace stays on DEMO_OUT's
        # filesystem and is atomic; the backups let a normal I/O failure roll
        # the pair back to the last known-good render.
        STAGED_SRT.replace(FINAL_SRT)
        published_srt = True
        STAGED_MP4.replace(FINAL_MP4)
        published_mp4 = True
    except OSError as error:
        if published_mp4:
            FINAL_MP4.unlink(missing_ok=True)
        if published_srt:
            FINAL_SRT.unlink(missing_ok=True)
        restore_errors: list[str] = []
        for backup, destination in (
            (backup_mp4, FINAL_MP4),
            (backup_srt, FINAL_SRT),
        ):
            if backup.exists():
                try:
                    backup.replace(destination)
                except OSError as restore_error:
                    restore_errors.append(f"{backup} -> {destination}: {restore_error}")
        detail = f"; rollback errors: {'; '.join(restore_errors)}" if restore_errors else ""
        raise RuntimeError(f"Could not atomically publish final demo outputs: {error}{detail}") from error
    else:
        backup_mp4.unlink(missing_ok=True)
        backup_srt.unlink(missing_ok=True)


def main() -> None:
    required_tools = ["ffmpeg", "ffprobe"]
    if VOICE_SOURCE is None:
        required_tools.append("say")
    for tool in required_tools:
        require_tool(tool)

    STAGED_MP4.unlink(missing_ok=True)
    STAGED_SRT.unlink(missing_ok=True)
    VOICE_ONLY_MP4.unlink(missing_ok=True)
    try:
        narration = parse_narration(NARRATION_FILE)
        preflight_narration_budget(narration)
        raw_clips = find_raw_clips()

        VOICE.mkdir(parents=True, exist_ok=True)
        SEGMENTS.mkdir(parents=True, exist_ok=True)
        segments = [
            DemoSegment(
                number=number,
                text=narration[number],
                raw_path=raw_clips[number],
                text_path=VOICE / f"{number:02d}.txt",
                voice_path=(
                    VOICE_SOURCE / f"{number:02d}.wav"
                    if VOICE_SOURCE is not None
                    else VOICE / f"{number:02d}.aiff"
                ),
                rendered_path=SEGMENTS / f"{number:02d}.mp4",
            )
            for number in SEGMENT_NUMBERS
        ]

        for segment in segments:
            segment.raw_duration = validate_raw_clip(segment.raw_path)
        if len(segments) != 8:
            raise RuntimeError(f"Internal clip count mismatch: expected 8, found {len(segments)}")

        for segment in segments:
            synthesize_voice(segment)

        planned_duration = sum(segment.target_duration for segment in segments)
        if planned_duration >= MAX_PLANNED_DURATION_SECONDS:
            raise RuntimeError(
                f"Synthesized narration is too long: {planned_duration:.2f}s including tail pauses; "
                f"budget is {MAX_PLANNED_DURATION_SECONDS:.2f}s before encoding",
            )

        for segment in segments:
            render_segment(segment)
        rendered_clips = sorted(SEGMENTS.glob("0[1-8].mp4"))
        if len(rendered_clips) != 8:
            raise RuntimeError(f"Expected 8 rendered clips; found {len(rendered_clips)}")

        concatenate_segments(segments, VOICE_ONLY_MP4)
        voice_only_duration = validate_h264_aac(VOICE_ONLY_MP4)
        add_ambient_soundtrack(VOICE_ONLY_MP4, STAGED_MP4, voice_only_duration)
        final_duration = validate_h264_aac(STAGED_MP4)
        if final_duration >= MAX_FINAL_DURATION_SECONDS:
            raise RuntimeError(
                f"Final demo is {final_duration:.3f}s; "
                f"it must remain below {MAX_FINAL_DURATION_SECONDS:.0f}s",
            )

        write_srt(segments, STAGED_SRT, final_duration)
        publish_staged_outputs()

        print(f"Rendered 8 clips to {FINAL_MP4} ({final_duration:.3f}s)")
        print(f"Subtitles written to {FINAL_SRT}")
    finally:
        # A failed encode, duration gate, subtitle validation, or publication
        # never leaves a candidate file under the uploadable final filenames.
        STAGED_MP4.unlink(missing_ok=True)
        STAGED_SRT.unlink(missing_ok=True)
        VOICE_ONLY_MP4.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(f"render_demo.py: {error}") from error
