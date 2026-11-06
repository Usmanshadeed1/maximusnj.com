/**
 * Code 128 (code set B) encoder for member cards (PROJECT_SCOPE.md §5.4).
 * Code set B covers printable ASCII (space to "~"), which includes every member number.
 * Output is a list of bar/space widths in modules, starting with a bar — easy to draw as SVG.
 */

/** Bar/space widths for symbol values 0–106 (106 = stop). Each symbol is 11 modules; stop is 13. */
export const CODE128_PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

/** Symbol values for the text, the checksum and start/stop codes. */
export function code128BValues(text: string): number[] {
  if (text.length === 0) throw new RangeError("Code 128 needs at least one character");
  const data = [...text].map((char) => {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) throw new RangeError(`"${char}" can't be encoded in Code 128 set B`);
    return code - 32;
  });
  const checksum = data.reduce((sum, value, i) => sum + value * (i + 1), START_B) % 103;
  return [START_B, ...data, checksum, STOP];
}

/** Alternating bar/space widths (in modules) for the whole symbol, beginning with a bar. */
export function encodeCode128B(text: string): number[] {
  return code128BValues(text).flatMap((value) => [...CODE128_PATTERNS[value]].map(Number));
}
