import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { loadEnvFile } from "node:process";

import OpenAI from "openai";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_NARRATION = join(ROOT, "docs", "DEMO_NARRATION.md");
const DEFAULT_OUTPUT = "/tmp/keepscape-demo/openai-audio15-marin";
const DEFAULT_MODEL = "gpt-audio-1.5";
const DEFAULT_VOICE = "marin";
const SEGMENT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const DEFAULT_SEGMENT_SPEEDS: Record<number, number> = {
  1: 1.17,
  2: 1.08,
  3: 0.99,
  4: 1.0,
  5: 1.13,
  6: 1.14,
  7: 1.0,
  8: 1.15,
};

const TARGET_DURATIONS: Record<number, number> = {
  1: 11.35,
  2: 12.55,
  3: 10.15,
  4: 14.6,
  5: 9.15,
  6: 9.55,
  7: 8.75,
  8: 4.1,
};

const AUDIO_DURATION_RANGES: Record<number, readonly [number, number]> = {
  1: [10.7, 11.2],
  2: [12.0, 12.7],
  3: [9.6, 10.1],
  4: [14.0, 14.6],
  5: [8.5, 9.1],
  6: [8.9, 9.6],
  7: [7.8, 8.5],
  8: [3.5, 3.9],
};

const AUDIO_WPM_RANGES: Record<number, readonly [number, number]> = {
  1: [150, 165],
  2: [150, 165],
  3: [125, 140],
  4: [120, 135],
  5: [140, 155],
  6: [140, 155],
  7: [115, 130],
  8: [120, 140],
};

const EDITORIAL_MAX_DURATIONS: Record<number, number> = {
  1: 11.6,
  2: 13.0,
  3: 10.5,
  4: 15.0,
  5: 9.4,
  6: 9.9,
  7: 9.1,
  8: 4.2,
};

const BASE_DIRECTION = [
  "Warm, grounded adult documentary narrator with a soft lower-mid register and neutral North American English.",
  "Keep the same speaker identity, vocal age, accent, microphone distance, pitch range, energy, and emotional temperature in every clip.",
  "Speak as if guiding one person through a dim family archive at night: intimate, human, quietly confident, and emotionally present without sentimentality.",
  "Use restrained wonder, never a commercial, corporate explainer, audiobook character, or movie-trailer delivery.",
  "Use natural micro-breaths and meaningful pauses without leaving dead air.",
  "Never speak annotations or stage directions such as short pause.",
  "Keep technical phrases precise and sentence endings firm. Avoid whispering, sing-song cadence, exaggerated drama, vocal fry, and upward inflection.",
  "Read the input verbatim. Do not add, omit, paraphrase, introduce, or conclude it.",
  "Pronounce Keepscape as KEEP-scape and GPT-5.6 as G P T five point six.",
  "Pronounce Codex as CODE-ex: the English word code followed by ex, with a clearly audible final K-S consonant cluster.",
  "Pronounce SDK and AI letter by letter, and tasseled as TASS-uhld.",
  "Generate dry narration only, with no music, ambience, or reverb.",
].join(" ");

const SEGMENT_DIRECTIONS: Record<number, string> = {
  1: "Begin intimately with a trace of first-discovery wonder. Let 'somewhere you can enter' lift gently, then make the final promise slower and firm.",
  2: "Invite the interaction. Give Evidence Lens and Truth Thread light emphasis. Space the three evidence items evenly, then land 'in plain sight' with quiet confidence.",
  3: "Be calm and ethically precise. Emphasize 'A person protects the truth.' Pause briefly before 'When the archive,' and protect the final uncertainty without melodrama.",
  4: "Keep this dense technical passage human and accessible. Distinguish the model, the person, and Codex. Make 'only opaque tokens—not family prose' unmistakable without slowing into a corporate presentation.",
  5: "Soften noticeably. Pause after 'falls quiet,' give the three lantern descriptions a tactile rhythm, and let the final image expand warmly rather than becoming a trailer climax.",
  6: "Add restrained playfulness. Treat 'Ring too early' as a gentle warning. Accelerate slightly through turn, loosen, chain, ring while keeping every action clear.",
  7: "Use a factual engineering-evidence tone with slightly brisker momentum. Make the numbers clear, credible, and unboastful; sustain energy through the final receipt.",
  8: "Pause briefly after Keepscape. Make 'Walk into memory' a personal invitation, then lower the pitch and end 'rewrite it' cleanly with no sales cadence.",
};

type Options = {
  narrationPath: string;
  outputDir: string;
  model: string;
  voice: string;
  speed: number | null;
  only: Set<number> | null;
  force: boolean;
  dryRun: boolean;
};

function usage(): string {
  return `Generate Keepscape's eight exact narration clips with the OpenAI audio APIs.

Usage:
  pnpm voice:openai -- [options]

Options:
  --out <directory>       Output directory (default: ${DEFAULT_OUTPUT})
  --narration <file>      Canonical Markdown narration
  --model <model>         Speech model (default: ${DEFAULT_MODEL})
  --voice <voice>         Built-in voice (default: ${DEFAULT_VOICE})
  --speed <number>        Override tuned speeds for legacy Speech-endpoint models only
  --only <01,02,...>      Generate only selected segments
  --force                 Replace existing selected clips
  --dry-run               Parse and show the generation plan without API calls
  --help                   Show this help

OPENAI_API_KEY must be present in the process environment for generation.
The script never reads a key from a command-line argument or writes it to disk.`;
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseOptions(args: string[]): Options {
  const options: Options = {
    narrationPath: DEFAULT_NARRATION,
    outputDir: DEFAULT_OUTPUT,
    model: process.env.OPENAI_TTS_MODEL?.trim() || DEFAULT_MODEL,
    voice: process.env.OPENAI_TTS_VOICE?.trim() || DEFAULT_VOICE,
    speed: null,
    only: null,
    force: false,
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (["--out", "--narration", "--model", "--voice", "--speed", "--only"].includes(arg)) {
      const value = valueAfter(args, index, arg);
      index += 1;
      if (arg === "--out") options.outputDir = resolve(value);
      if (arg === "--narration") options.narrationPath = resolve(value);
      if (arg === "--model") options.model = value;
      if (arg === "--voice") options.voice = value;
      if (arg === "--speed") options.speed = Number(value);
      if (arg === "--only") {
        const selected = value.split(",").map((item) => Number(item.trim()));
        if (
          selected.length === 0 ||
          selected.some((number) => !Number.isInteger(number) || !SEGMENT_NUMBERS.includes(number as (typeof SEGMENT_NUMBERS)[number]))
        ) {
          throw new Error("--only must contain comma-separated segment numbers from 01 through 08");
        }
        options.only = new Set(selected);
      }
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  if (
    options.speed !== null &&
    (!Number.isFinite(options.speed) || options.speed < 0.25 || options.speed > 4)
  ) {
    throw new Error("--speed must be a number from 0.25 through 4.0");
  }
  return options;
}

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
    const section = line.match(/^##\s+(0[1-8])(?:\s+|$)/);
    if (section) {
      current = Number(section[1]);
      if (sections.has(current)) throw new Error(`Narration section ${section[1]} appears more than once`);
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
  if (sections.size !== SEGMENT_NUMBERS.length) throw new Error("Narration must contain sections 01 through 08 exactly once");
  return narration;
}

function durationSeconds(path: string): number {
  const output = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
    { encoding: "utf8" },
  ).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`ffprobe returned an invalid duration for ${path}`);
  return duration;
}

function usesChatAudio(model: string): boolean {
  return model.startsWith("gpt-audio");
}

function trimAndPadVoice(input: string, output: string): void {
  const trimStart = "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB:start_silence=0.02";
  const filter = `${trimStart},areverse,${trimStart},areverse,adelay=120:all=1,apad=pad_dur=0.18`;
  execFileSync(
    "ffmpeg",
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-map",
      "0:a:0",
      "-af",
      filter,
      "-ar",
      "24000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      output,
    ],
    { stdio: "inherit" },
  );
}

async function generateRawVoice(
  client: OpenAI,
  options: Options,
  number: number,
  text: string,
  rawPath: string,
): Promise<string | null> {
  const model = options.model;
  if (usesChatAudio(model)) {
    const [minimumSeconds, maximumSeconds] = AUDIO_DURATION_RANGES[number];
    const [minimumWpm, maximumWpm] = AUDIO_WPM_RANGES[number];
    const response = await client.chat.completions.create({
      model,
      modalities: ["text", "audio"],
      audio: { voice: options.voice, format: "wav" },
      messages: [
        {
          role: "system",
          content:
            `${BASE_DIRECTION} Speak at ${minimumWpm} to ${maximumWpm} words per minute. ` +
            `Complete the entire spoken clip in ${minimumSeconds.toFixed(1)} to ` +
            `${maximumSeconds.toFixed(1)} seconds, with no pause longer than 250 milliseconds.`,
        },
        {
          role: "user",
          content:
            `Read only the following script verbatim. ${SEGMENT_DIRECTIONS[number]} ` +
            `Do not vocalize any directions. SCRIPT START:\n${text}\nSCRIPT END.`,
        },
      ],
    });
    const audio = response.choices[0]?.message.audio;
    if (!audio) throw new Error(`Model ${model} returned no audio for segment ${number}`);
    writeFileSync(rawPath, Buffer.from(audio.data, "base64"));
    return audio.transcript;
  }

  const speed = options.speed ?? DEFAULT_SEGMENT_SPEEDS[number];
  const response = await client.audio.speech.create({
    model,
    voice: options.voice,
    input: text,
    instructions: `${BASE_DIRECTION} ${SEGMENT_DIRECTIONS[number]}`,
    response_format: "wav",
    speed,
  });
  writeFileSync(rawPath, Buffer.from(await response.arrayBuffer()));
  return null;
}

function existingClipMatches(wavPath: string, textPath: string, text: string): boolean {
  if (!existsSync(wavPath) && !existsSync(textPath)) return false;
  if (!existsSync(wavPath) || !existsSync(textPath)) {
    throw new Error(`Incomplete existing voice pair: ${wavPath} / ${textPath}. Use --force to replace it.`);
  }
  const existingText = readFileSync(textPath, "utf8").replace(/\s+/g, " ").trim();
  if (existingText !== text) {
    throw new Error(`Existing transcript does not match the canonical narration: ${textPath}. Use --force to replace it.`);
  }
  return true;
}

async function main(): Promise<void> {
  const localEnvPath = join(ROOT, ".env.local");
  if (!process.env.OPENAI_API_KEY?.trim() && existsSync(localEnvPath)) loadEnvFile(localEnvPath);

  const options = parseOptions(process.argv.slice(2));
  const narration = parseNarration(options.narrationPath);
  const selected = SEGMENT_NUMBERS.filter((number) => !options.only || options.only.has(number));
  const hasChatAudio = usesChatAudio(options.model);
  if (hasChatAudio && options.speed !== null) {
    throw new Error("--speed is unavailable for gpt-audio models; their per-segment timing is prompt-controlled");
  }

  console.log(`Narration: ${options.narrationPath}`);
  console.log(`Output: ${options.outputDir}`);
  console.log(`Model strategy / voice: ${options.model} / ${options.voice}`);
  for (const number of selected) {
    const text = narration.get(number);
    const speed = options.speed ?? DEFAULT_SEGMENT_SPEEDS[number];
    const model = options.model;
    const chatAudio = usesChatAudio(model);
    const timing = chatAudio
      ? `prompt ${AUDIO_DURATION_RANGES[number][0].toFixed(1)}–${AUDIO_DURATION_RANGES[number][1].toFixed(1)}s`
      : `speed ${speed.toFixed(3)}`;
    console.log(
      `${String(number).padStart(2, "0")}: ${model}; ${text?.split(/\s+/).length ?? 0} words; ` +
        `${timing}; target ${TARGET_DURATIONS[number].toFixed(2)}s; ` +
        `editorial max ${EDITORIAL_MAX_DURATIONS[number].toFixed(2)}s`,
    );
  }
  if (options.dryRun) return;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error(
      `OPENAI_API_KEY is not present. Put it in ${localEnvPath} or export it in this shell; do not paste it into chat.`,
    );
  }

  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  mkdirSync(options.outputDir, { recursive: true });
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (const number of selected) {
    const label = String(number).padStart(2, "0");
    const text = narration.get(number);
    const speed = options.speed ?? DEFAULT_SEGMENT_SPEEDS[number];
    const chatAudio = usesChatAudio(options.model);
    if (!text) throw new Error(`Internal narration lookup failed for segment ${label}`);

    const wavPath = join(options.outputDir, `${label}.wav`);
    const textPath = join(options.outputDir, `${label}.txt`);
    if (!options.force && existingClipMatches(wavPath, textPath, text)) {
      console.log(`${label}: keeping existing matching clip (${durationSeconds(wavPath).toFixed(3)}s)`);
      continue;
    }

    const rawPath = join(options.outputDir, `.${label}.${process.pid}.raw.wav`);
    const readyPath = join(options.outputDir, `.${label}.${process.pid}.ready.wav`);
    const stagedTextPath = join(options.outputDir, `.${label}.${process.pid}.txt`);
    rmSync(rawPath, { force: true });
    rmSync(readyPath, { force: true });
    rmSync(stagedTextPath, { force: true });

    try {
      console.log(`${label}: requesting OpenAI speech…`);
      const generatedTranscript = await generateRawVoice(client, options, number, text, rawPath);
      if (generatedTranscript) console.log(`${label}: model transcript: ${generatedTranscript}`);
      trimAndPadVoice(rawPath, readyPath);

      const duration = durationSeconds(readyPath);
      const editorialMax = EDITORIAL_MAX_DURATIONS[number];
      if (duration > editorialMax) {
        if (chatAudio) {
          throw new Error(
            `Segment ${label} is ${duration.toFixed(3)}s, above its ${editorialMax.toFixed(2)}s editorial max. ` +
              "Regenerate the segment; gpt-audio timing is prompt-controlled and can vary between calls.",
          );
        }
        const suggestedSpeed = Math.min(4, speed * (duration / TARGET_DURATIONS[number]));
        throw new Error(
          `Segment ${label} is ${duration.toFixed(3)}s, above its ${editorialMax.toFixed(2)}s editorial max. ` +
            `Regenerate it with --only ${label} --force --speed ${suggestedSpeed.toFixed(2)}.`,
        );
      }
      if (duration < TARGET_DURATIONS[number] - 0.8) {
        console.warn(
          `${label}: ${duration.toFixed(3)}s is notably faster than the ${TARGET_DURATIONS[number].toFixed(2)}s target; audition before final render.`,
        );
      }

      writeFileSync(stagedTextPath, `${text}\n`, "utf8");
      renameSync(readyPath, wavPath);
      renameSync(stagedTextPath, textPath);
      console.log(`${label}: wrote ${wavPath} (${duration.toFixed(3)}s)`);
    } finally {
      rmSync(rawPath, { force: true });
      rmSync(readyPath, { force: true });
      rmSync(stagedTextPath, { force: true });
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`generate-openai-narration: ${message}`);
  process.exitCode = 1;
});
