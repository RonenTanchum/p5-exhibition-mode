#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));

if (!args.input || args.help) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const input = path.resolve(args.input);
const preset = args.preset || args.codec || "prores";
const output = path.resolve(args.output || defaultOutput(input, preset));
const ffmpeg = args.ffmpeg || "ffmpeg";
const command = buildFfmpegCommand({ input, output, preset, bitrate: args.bitrate });

console.log(`Input: ${input}`);
console.log(`Output: ${output}`);
console.log(`Preset: ${preset}`);
console.log(`${ffmpeg} ${command.join(" ")}`);

const child = spawn(ffmpeg, command, { stdio: "inherit" });
child.on("error", (error) => {
  console.error(`Failed to run ${ffmpeg}: ${error.message}`);
  console.error("Install FFmpeg first, then run this helper again.");
  console.error("macOS: brew install ffmpeg");
  console.error("Official downloads: https://www.ffmpeg.org/download.html");
  console.error("GitHub mirror: https://github.com/FFmpeg/FFmpeg");
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));

function buildFfmpegCommand({ input, output, preset, bitrate }) {
  const base = ["-y", "-i", input];
  if (preset === "h264" || preset === "mp4") {
    return [
      ...base,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-preset", "slow",
      "-crf", "14",
      ...(bitrate ? ["-b:v", bitrate] : []),
      "-movflags", "+faststart",
      "-an",
      output
    ];
  }
  return [
    ...base,
    "-c:v", "prores_ks",
    "-profile:v", "3",
    "-pix_fmt", "yuv422p10le",
    "-vendor", "apl0",
    "-an",
    output
  ];
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") parsed.input = argv[++i];
    else if (arg === "--output" || arg === "-o") parsed.output = argv[++i];
    else if (arg === "--preset" || arg === "--codec") parsed.preset = argv[++i];
    else if (arg === "--bitrate") parsed.bitrate = argv[++i];
    else if (arg === "--ffmpeg") parsed.ffmpeg = argv[++i];
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (!parsed.input) parsed.input = arg;
  }
  return parsed;
}

function defaultOutput(input, preset) {
  const parsed = path.parse(input);
  const ext = preset === "h264" || preset === "mp4" ? ".mp4" : ".mov";
  const label = preset === "h264" || preset === "mp4" ? "h264" : "prores";
  return path.join(parsed.dir, `${parsed.name}-${label}${ext}`);
}

function printHelp() {
  console.log(`Usage:
  p5-exhibition-capture --input capture.webm --preset prores
  p5-exhibition-capture --input capture.webm --preset h264 --output capture.mp4

Options:
  --input, -i      Browser recording file, usually .webm or .mp4
  --output, -o     Output path. Defaults next to input
  --preset         prores or h264
  --bitrate        Optional h264 bitrate, for example 60M
  --ffmpeg         FFmpeg binary path. Defaults to ffmpeg

Install FFmpeg:
  macOS: brew install ffmpeg
  Official downloads: https://www.ffmpeg.org/download.html
  GitHub mirror: https://github.com/FFmpeg/FFmpeg`);
}
