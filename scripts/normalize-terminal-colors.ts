/** Preserve terminal color state for freeze, which loses it at line breaks and selective resets. */
export function normalizeTerminalColors(input: string, foreground: string, background: string): string {
  const rgb = (color: string) => {
    if (!/^#[\da-f]{6}$/i.test(color)) throw new Error(`Expected an RGB hex color: ${color}`);
    return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  };
  const defaultFg = [38, 2, ...rgb(foreground)];
  const defaultBg = [48, 2, ...rgb(background)];
  let fg = defaultFg;
  let bg = defaultBg;
  const colors = () => `\x1b[${[...fg, ...bg].join(";")}m`;
  // The Map Is Not the Territory: keep the terminal's color semantics, not the converter's resets.
  // oxlint-disable-next-line no-control-regex -- ANSI escape sequences are the input format.
  return colors() + input.replace(/\x1b\[([\d;]*)m|\n/g, (_sequence, parameters: string | undefined, offset: number) => {
    // A trailing newline terminates the capture; it does not begin another terminal row.
    if (parameters === undefined) return "\n" + (offset === input.length - 1 ? "" : colors());
    const codes = parameters.split(";").map(Number);
    const expanded: number[] = [];
    for (let i = 0; i < codes.length;) {
      const code = codes[i]!;
      // RGB and indexed colors contain numbers that are data, not independent SGR commands.
      if (code === 38 || code === 48) {
        const count = codes[i + 1] === 2 ? 5 : codes[i + 1] === 5 ? 3 : 1;
        const color = codes.slice(i, i + count);
        if (code === 38) fg = color;
        else bg = color;
        expanded.push(...color);
        i += count;
      } else {
        if (code === 0 || code === 39) fg = defaultFg;
        if (code === 0 || code === 49) bg = defaultBg;
        if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) fg = [code];
        if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) bg = [code];
        expanded.push(...(code === 0 ? [0, ...fg, ...bg] : code === 39 ? fg : code === 49 ? bg : [code]));
        i++;
      }
    }
    return `\x1b[${expanded.join(";")}m`;
  });
}
