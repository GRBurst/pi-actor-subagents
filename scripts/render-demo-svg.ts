import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { normalizeTerminalColors } from "./normalize-terminal-colors.ts";

const theme = JSON.parse(readFileSync("scripts/tokyo-night.json", "utf8"));
const capture = readFileSync(process.argv[2]!, "utf8");
// DRY: the real Pi theme also supplies the converter's terminal-default colors.
execFileSync("freeze", [
  "--config", "base", "--language", "ansi", "--background", theme.export.pageBg,
  "--font.family", "monospace", "--font.size", "16", "--line-height", "1.3",
  "--padding", "16", "--margin", "0", "--border.radius", "0", "--output", "docs/subagents.svg",
], {
  input: normalizeTerminalColors(capture, theme.colors.text, theme.export.pageBg),
  stdio: ["pipe", "inherit", "inherit"],
});
