/**
 * Small models sometimes get stuck repeating part of an answer until they run
 * out of tokens. Asked 52 general questions, Phi-4 did on 4 (photosynthesis, a
 * Goa trip, why the sky is blue twice), each answer running to the 1,024-token
 * limit: "…Rayleigh scattering and similarly and similarly and similarly…". The
 * offscreen document checks the answer after every token and stops generating
 * once the same block has come three times in a row, keeping one copy.
 */

/** Shorter blocks repeat in ordinary text: "Mix well." */
export const MIN_BLOCK = 30;
/** Two copies in a row happen in real answers (a repeated line of code); three is a loop. */
export const COPIES = 3;

/**
 * How much of `text` to keep when it ends in COPIES back-to-back copies of the
 * same block of at least MIN_BLOCK characters: up to the end of the first
 * copy. -1 when it doesn't. A block needs a letter, so a long rule of "=" or
 * "-" is left alone.
 */
export function repeatCut(text: string, minBlock = MIN_BLOCK, copies = COPIES): number {
  const n = text.length;
  if (n < minBlock * copies) return -1;
  const lastLetter = lastLetterIndex(text);
  const tail = text.slice(n - minBlock);
  // Every earlier occurrence of the last minBlock characters gives a candidate
  // block length, shortest first.
  let at = text.lastIndexOf(tail, n - minBlock - 1);
  while (at >= 0) {
    const block = n - minBlock - at;
    if (block * copies > n) break;
    if (block >= minBlock && n - block <= lastLetter && repeatsFrom(text, n - block * copies, block)) {
      // What repeats can be shorter than a block: "and similarly " is 14 characters.
      const unit = shortestPeriod(text, n - block * copies, block);
      // The loop may have started before the last COPIES copies.
      let start = n - block * copies;
      while (start > 0 && text[start - 1] === text[start - 1 + unit]) start--;
      return endOfFirstCopy(text, start, unit);
    }
    at = at > 0 ? text.lastIndexOf(tail, at - 1) : -1;
  }
  return -1;
}

/**
 * Where the first copy ends, for a loop from `start` that repeats every
 * `period` characters. Where the copies begin is ambiguous when the text
 * before them ends the way they do: Phi-4 wrote "…of this trip information and
 * experiences may not fully meet your needs and preferences." and then
 * repeated "This information and experiences information and experiences may
 * not fully meet your needs and preferences." So the cut goes at a natural
 * break one period on: a line break, else the end of a sentence, else a space.
 */
function endOfFirstCopy(text: string, start: number, period: number): number {
  const from = start + period;
  const to = start + 2 * period;
  for (const brk of [/\n\s*/g, /[.!?]\s+|[。！？]/g, /\s+/g]) {
    brk.lastIndex = start;
    for (let m = brk.exec(text); m && m.index < to; m = brk.exec(text)) {
      const end = m.index + m[0].length;
      if (end >= from && end < to) return end;
    }
  }
  return from;
}

/** The fewest characters text from `from` to the end repeats every, up to `max`. */
function shortestPeriod(text: string, from: number, max: number): number {
  for (let period = 1; period < max; period++) {
    if (repeatsFrom(text, from, period)) return period;
  }
  return max;
}

/** Whether text from `from` to the end repeats every `block` characters. */
function repeatsFrom(text: string, from: number, block: number): boolean {
  for (let i = from; i + block < text.length; i++) {
    if (text[i] !== text[i + block]) return false;
  }
  return true;
}

function lastLetterIndex(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (/\p{L}/u.test(text.charAt(i))) return i;
  }
  return -1;
}
