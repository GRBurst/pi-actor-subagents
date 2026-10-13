import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTerminalColors } from "./normalize-terminal-colors.ts";

const foreground = "#c0caf5";
const background = "#1a1b26";
const fg = "38;2;192;202;245";
const bg = "48;2;26;27;38";
const defaults = `\x1b[${fg};${bg}m`;
const expand = (input: string) => normalizeTerminalColors(input, foreground, background).slice(defaults.length);

test("selective color resets become explicit colors without resetting the other channel", () => {
  assert.equal(expand("\x1b[49m plain"), `\x1b[${bg}m plain`);
  assert.equal(expand("\x1b[39m text"), `\x1b[${fg}m text`);
  assert.equal(expand("\x1b[39;49m"), `\x1b[${fg};${bg}m`);
});

test("a full reset still clears attributes and restores both default colors", () => {
  assert.equal(expand("\x1b[0m"), `\x1b[0;${fg};${bg}m`);
  assert.equal(expand("\x1b[m"), `\x1b[0;${fg};${bg}m`);
});

test("RGB and indexed color parameters are not mistaken for reset commands", () => {
  for (const input of ["\x1b[38;2;0;39;49m", "\x1b[48;5;39m", "\x1b[38;5;49m"]) {
    assert.equal(expand(input), input);
  }
  assert.equal(expand("\x1b[48;2;0;39;49;39m"), `\x1b[48;2;0;39;49;${fg}m`);
});

test("text and unrelated terminal attributes are unchanged", () => {
  const input = "first\n\x1b[1;4m bold and underlined\x1b[22;24m\x1b[2K";
  assert.equal(expand(input), input.replace("\n", "\n" + defaults));
});

test("line breaks retain RGB, indexed, and basic colors independently", () => {
  assert.equal(expand("\x1b[48;2;35;53;45mfirst\nsecond"),
    `\x1b[48;2;35;53;45mfirst\n\x1b[${fg};48;2;35;53;45msecond`);
  assert.equal(expand("\x1b[38;5;39;48;5;49mfirst\nsecond"),
    "\x1b[38;5;39;48;5;49mfirst\n\x1b[38;5;39;48;5;49msecond");
  assert.equal(expand("\x1b[31;104mfirst\nsecond"), "\x1b[31;104mfirst\n\x1b[31;104msecond");
});

test("selective resets and a full reset update the colors carried across lines", () => {
  assert.equal(expand("\x1b[31;44mred\x1b[39mdefault\nnext"),
    `\x1b[31;44mred\x1b[${fg}mdefault\n\x1b[${fg};44mnext`);
  assert.equal(expand("\x1b[31;44mred\x1b[49mdefault\nnext"),
    `\x1b[31;44mred\x1b[${bg}mdefault\n\x1b[31;${bg}mnext`);
  assert.equal(expand("\x1b[31;44mred\x1b[0mdefault\nnext"),
    `\x1b[31;44mred\x1b[0;${fg};${bg}mdefault\n${defaults}next`);
});

test("a trailing newline does not inject a phantom terminal row", () => {
  assert.equal(expand("text\n"), "text\n");
});

test("the first line starts in the theme's default colors", () => {
  assert.equal(normalizeTerminalColors("plain text", foreground, background), defaults + "plain text");
});
