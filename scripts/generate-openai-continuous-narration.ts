import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import OpenAI from "openai";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NARRATION_PATH = join(ROOT, "docs", "DEMO_NARRATION.md");
const DEFAULT_OUTPUT = "/tmp/keepscape-demo/openai-continuous-marin";
const MODEL = "gpt-audio-1.5";
const VOICE = "marin";
const MAX_DURATION_OVERRUN_SECONDS = 0.4;
const SEGMENT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const MAX_SEGMENT_DURATIONS: Record<number, number> = {
  1: 12.5,
  2: 13.0,
  3: 10.5,
  4: 15.0,
  5: 9.4,
  6: 9.9,
  7: 9.1,
  8: 4.2,
};

const DIRECTION = [
  "Use one continuous performance by one warm, grounded adult documentary narrator with a soft lower-mid register and neutral North American English.",
  "Keep the same speaker identity, vocal age, accent, microphone distance, pitch range, energy, pace, and emotional temperature from beginning to end.",
  "Hold a steady conversational pace of 145 to 155 words per minute. Do not slow down for technical passages, lists, or the closing line.",
  "Speak as if guiding one person through a dim family archive at night: intimate, human, quietly confident, and emotionally present without sentimentality.",
  "Use restrained wonder, never a commercial, corporate explainer, audiobook character, or movie-trailer delivery.",
  "Read every word verbatim and in order. Do not add an introduction, conclusion, heading, paragraph number, annotation, or stage direction.",
  "Treat each blank line as a new scene and leave a natural silent pause of 300 to 400 milliseconds there, while keeping the narrator's character unchanged.",
  "Keep every other pause under 280 milliseconds.",
  "Use natural micro-breaths and firm sentence endings. Avoid whispering, sing-song cadence, exaggerated drama, vocal fry, and upward inflection.",
  "Pronounce Keepscape as two crisp syllables, KEEP-SCAPE; it must never sound like keepsake. Pronounce GPT-5.6 as G P T five point six.",
  "Pronounce Codex as CODE-ex: the English word code followed by ex, with a clearly audible final K-S consonant cluster.",
  "Pronounce SDK and AI letter by letter, tasseled as TASS-uhld, receipt as REE-SEET, and Ring with a clear final NG; Ring must not sound like rain.",
  "In the final phrase, pronounce re-write it as REE-WRITE IT with a crisp W and T; it must not sound like remind it.",
  "Generate dry narration only, with no music, ambience, or reverb.",
].join(" ");

type TimedWord = {
  token: string;
  start: number;
  end: number;
  probability: number;
};

type WhisperJson = {
  text?: string;
  segments?: Array<{
    words?: Array<{
      word?: string;
      start?: number;
      end?: number;
      probability?: number;
    }>;
  }>;
};

type CanonicalToken = {
  token: string;
  segment: number;
};

function cleanMarkdown(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNarration(path: string): Map<number, string> {
  if (!existsSync(path)) throw new Error(`Narration file does not exist: ${path}`);
  const sections = new Map<number, string[]>();
  let current: number | null = null;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const heading = line.match(/^##\s+(0[1-8])(?:\s+|$)/);
    if (heading) {
      current = Number(heading[1]);
      sections.set(current, []);
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      current = null;
      continue;
    }
    if (current !== null) sections.get(current)?.push(line);
  }

  const narration = new Map<number, string>();
  for (const number of SEGMENT_NUMBERS) {
    const lines = sections.get(number);
    if (!lines) throw new Error(`Narration section ${String(number).padStart(2, "0")} is missing`);
    const text = cleanMarkdown(lines);
    if (!text) throw new Error(`Narration section ${String(number).padStart(2, "0")} is empty`);
    narration.set(number, text);
  }
  if (sections.size !== SEGMENT_NUMBERS.length) {
    throw new Error("Narration must contain sections 01 through 08 exactly once");
  }
  return narration;
}

function tokens(text: string): string[] {
  return Array.from(text.toLocaleLowerCase("en-US").matchAll(/[\p{L}\p{N}]+/gu), (match) => match[0]);
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function substitutionCost(left: string, right: string): number {
  if (left === right) return 0;
  return Math.min(1, editDistance(left, right) / Math.max(left.length, right.length, 1));
}

function alignTokens(canonical: CanonicalToken[], recognized: TimedWord[]): Array<number | null> {
  const rows = canonical.length + 1;
  const columns = recognized.length + 1;
  const cost = Array.from({ length: rows }, () => new Float64Array(columns));
  const move = Array.from({ length: rows }, () => new Uint8Array(columns));
  for (let row = 1; row < rows; row += 1) {
    cost[row][0] = row;
    move[row][0] = 1;
  }
  for (let column = 1; column < columns; column += 1) {
    cost[0][column] = column;
    move[0][column] = 2;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const diagonal = cost[row - 1][column - 1] + substitutionCost(
        canonical[row - 1].token,
        recognized[column - 1].token,
      );
      const deleteCanonical = cost[row - 1][column] + 1;
      const insertRecognized = cost[row][column - 1] + 1;
      if (diagonal <= deleteCanonical && diagonal <= insertRecognized) {
        cost[row][column] = diagonal;
        move[row][column] = 0;
      } else if (deleteCanonical <= insertRecognized) {
        cost[row][column] = deleteCanonical;
        move[row][column] = 1;
      } else {
        cost[row][column] = insertRecognized;
        move[row][column] = 2;
      }
    }
  }

  const mapping: Array<number | null> = Array.from({ length: canonical.length }, () => null);
  let row = canonical.length;
  let column = recognized.length;
  while (row > 0 || column > 0) {
    const direction = move[row][column];
    if (row > 0 && column > 0 && direction === 0) {
      if (substitutionCost(canonical[row - 1].token, recognized[column - 1].token) <= 0.5) {
        mapping[row - 1] = column - 1;
      }
      row -= 1;
      column -= 1;
    } else if (row > 0 && (column === 0 || direction === 1)) {
      row -= 1;
    } else {
      column -= 1;
    }
  }
  return mapping;
}

function durationSeconds(path: string): number {
  const output = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
    { encoding: "utf8" },
  ).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration for ${path}`);
  return duration;
}

function normalizeContinuous(input: string, output: string): void {
  const trim = "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB:start_silence=0.02";
  execFileSync(
    "ffmpeg",
    [
      "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-map", "0:a:0", "-af", `${trim},areverse,${trim},areverse,adelay=120:all=1,apad=pad_dur=0.18`,
      "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", output,
    ],
    { stdio: "inherit" },
  );
}

function whisperWords(audioPath: string, workDir: string): { transcript: string; words: TimedWord[] } {
  const whisperDir = join(workDir, "whisper");
  rmSync(whisperDir, { recursive: true, force: true });
  mkdirSync(whisperDir, { recursive: true });
  execFileSync(
    "whisper",
    [
      audioPath,
      "--model", "small",
      "--language", "en",
      "--output_format", "json",
      "--word_timestamps", "True",
      "--output_dir", whisperDir,
    ],
    { stdio: "inherit" },
  );
  const parsed = JSON.parse(readFileSync(join(whisperDir, "continuous.json"), "utf8")) as WhisperJson;
  const words: TimedWord[] = [];
  for (const segment of parsed.segments ?? []) {
    for (const word of segment.words ?? []) {
      if (typeof word.start !== "number" || typeof word.end !== "number" || typeof word.word !== "string") continue;
      const wordTokens = tokens(word.word);
      for (const token of wordTokens) {
        words.push({
          token,
          start: word.start,
          end: word.end,
          probability: typeof word.probability === "number" ? word.probability : 0,
        });
      }
    }
  }
  if (words.length === 0) throw new Error("Whisper returned no timed words");
  return { transcript: parsed.text?.trim() ?? "", words };
}

function splitContinuous(
  continuousPath: string,
  outputDir: string,
  narration: Map<number, string>,
  apiTranscript: string,
): void {
  const canonical: CanonicalToken[] = [];
  for (const number of SEGMENT_NUMBERS) {
    for (const token of tokens(narration.get(number) ?? "")) canonical.push({ token, segment: number });
  }
  const { transcript: whisperTranscript, words } = whisperWords(continuousPath, outputDir);
  const mapping = alignTokens(canonical, words);
  const mappedCount = mapping.filter((index) => index !== null).length;
  const coverage = mappedCount / canonical.length;
  if (coverage < 0.9) {
    throw new Error(`Canonical-to-audio word alignment is only ${(coverage * 100).toFixed(1)}%; regenerate the take`);
  }

  const durations: Record<string, number> = {};
  const windows: Record<string, { start: number; end: number }> = {};
  const continuousDuration = durationSeconds(continuousPath);
  for (const number of SEGMENT_NUMBERS) {
    const label = String(number).padStart(2, "0");
    const recognizedIndexes = canonical
      .map((item, index) => (item.segment === number ? mapping[index] : null))
      .filter((index): index is number => index !== null);
    if (recognizedIndexes.length === 0) throw new Error(`Could not align narration segment ${label}`);
    const firstWordStart = Math.min(...recognizedIndexes.map((index) => words[index].start));
    const lastWordEnd = Math.max(...recognizedIndexes.map((index) => words[index].end));
    const start = Math.max(0, firstWordStart - 0.12);
    const end = Math.min(continuousDuration, lastWordEnd + 0.18);
    const duration = end - start;
    if (duration <= 0) throw new Error(`Segment ${label} has a non-positive aligned duration`);
    if (duration > MAX_SEGMENT_DURATIONS[number] + MAX_DURATION_OVERRUN_SECONDS) {
      throw new Error(
        `Segment ${label} is ${duration.toFixed(3)}s after continuous alignment; ` +
        `the release maximum is ${(MAX_SEGMENT_DURATIONS[number] + MAX_DURATION_OVERRUN_SECONDS).toFixed(2)}s`,
      );
    }
    const staged = join(outputDir, `.${label}.${process.pid}.wav`);
    const destination = join(outputDir, `${label}.wav`);
    rmSync(staged, { force: true });
    execFileSync(
      "ffmpeg",
      [
        "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", continuousPath,
        "-af",
        `atrim=start=${start.toFixed(6)}:end=${end.toFixed(6)},` +
          `asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.008,` +
          `afade=t=out:st=${Math.max(0, duration - 0.008).toFixed(6)}:d=0.008`,
        "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", staged,
      ],
      { stdio: "inherit" },
    );
    renameSync(staged, destination);
    writeFileSync(join(outputDir, `${label}.txt`), `${narration.get(number)}\n`, "utf8");
    durations[label] = durationSeconds(destination);
    windows[label] = { start, end };
  }

  writeFileSync(
    join(outputDir, "continuous-alignment.json"),
    `${JSON.stringify({
      model: MODEL,
      voice: VOICE,
      coverage,
      apiTranscript,
      whisperTranscript,
      windowsSeconds: windows,
      durationsSeconds: durations,
    }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Aligned ${(coverage * 100).toFixed(1)}% of canonical words`);
  console.log(`Segment durations: ${Object.entries(durations).map(([label, value]) => `${label}=${value.toFixed(3)}s`).join(", ")}`);
}

async function main(): Promise<void> {
  const outputArg = process.argv.indexOf("--out");
  const outputDir = outputArg >= 0 && process.argv[outputArg + 1]
    ? resolve(process.argv[outputArg + 1])
    : DEFAULT_OUTPUT;
  const reuse = process.argv.includes("--reuse");
  const continuousPath = join(outputDir, "continuous.wav");
  const apiTranscriptPath = join(outputDir, "continuous-api-transcript.txt");
  const localEnvPath = join(ROOT, ".env.local");
  if (!reuse && !process.env.OPENAI_API_KEY?.trim() && existsSync(localEnvPath)) loadEnvFile(localEnvPath);
  if (!reuse && !process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not present; export it in this shell and never pass it as an argument");
  }

  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  execFileSync("whisper", ["--help"], { stdio: "ignore" });
  mkdirSync(outputDir, { recursive: true });
  const narration = parseNarration(NARRATION_PATH);
  if (reuse) {
    if (!existsSync(continuousPath) || !existsSync(apiTranscriptPath)) {
      throw new Error(`--reuse requires ${continuousPath} and ${apiTranscriptPath}`);
    }
    splitContinuous(
      continuousPath,
      outputDir,
      narration,
      readFileSync(apiTranscriptPath, "utf8").trim(),
    );
    console.log(`Reused continuous narration in ${outputDir}`);
    return;
  }
  const script = SEGMENT_NUMBERS
    .map((number) => narration.get(number))
    .join("\n\n")
    .replace("rewrite it.", "re-write it.");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log(`Requesting one continuous ${MODEL} / ${VOICE} narration take…`);
  const response = await client.chat.completions.create({
    model: MODEL,
    modalities: ["text", "audio"],
    audio: { voice: VOICE, format: "wav" },
    messages: [
      { role: "system", content: DIRECTION },
      { role: "user", content: `Read only this script verbatim:\n\n${script}` },
    ],
  });
  const audio = response.choices[0]?.message.audio;
  if (!audio) throw new Error(`${MODEL} returned no audio`);

  const rawPath = join(outputDir, `.continuous.${process.pid}.raw.wav`);
  const stagedPath = join(outputDir, `.continuous.${process.pid}.wav`);
  rmSync(rawPath, { force: true });
  rmSync(stagedPath, { force: true });
  try {
    writeFileSync(rawPath, Buffer.from(audio.data, "base64"));
    normalizeContinuous(rawPath, stagedPath);
    const continuousDuration = durationSeconds(stagedPath);
    if (continuousDuration > 110) {
      throw new Error(
        `Continuous narration is ${continuousDuration.toFixed(3)}s; refusing a likely runaway audio response`,
      );
    }
    renameSync(stagedPath, continuousPath);
    writeFileSync(join(outputDir, "continuous-api-transcript.txt"), `${audio.transcript ?? ""}\n`, "utf8");
    splitContinuous(continuousPath, outputDir, narration, audio.transcript ?? "");
  } finally {
    rmSync(rawPath, { force: true });
    rmSync(stagedPath, { force: true });
  }
  console.log(`Continuous narration written to ${outputDir}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`generate-openai-continuous-narration: ${message}`);
  process.exitCode = 1;
});
