import { describe, it, expect } from 'vitest';
import { repeatCut } from '../repetition';

/** What the offscreen document keeps of a stuck answer. */
const kept = (text: string) => {
  const cut = repeatCut(text);
  return cut < 0 ? null : text.slice(0, cut).trimEnd();
};

describe('repeatCut()', () => {
  const line = 'Remember, I run entirely on your device.\n\n';

  it('leaves an ordinary answer alone', () => {
    const answer = 'Mix the flour and milk. Mix well. Heat the pan. Mix well. Pour a ladle of batter, then flip once bubbles form.';
    expect(repeatCut(answer)).toBe(-1);
  });

  it('cuts a block that came three times in a row down to one', () => {
    expect(kept('Silver moon rises\n\n' + line.repeat(3))).toBe('Silver moon rises\n\nRemember, I run entirely on your device.');
  });

  it('waits for the third copy', () => {
    expect(repeatCut('Silver moon rises\n\n' + line.repeat(2))).toBe(-1);
  });

  it('cuts at the end of the first copy when the answer stops partway into another', () => {
    expect(kept('Silver moon rises\n\n' + line.repeat(3) + 'Remem')).toBe('Silver moon rises\n\nRemember, I run entirely on your device.');
  });

  it('keeps one copy from where the loop began, however many came before', () => {
    const item = '- Wear sunscreen and drink plenty of water.\n';
    expect(kept('Tips:\n' + item.repeat(7))).toBe('Tips:\n- Wear sunscreen and drink plenty of water.');
  });

  it('keeps the first copy whole when the text before it ends the way the block does', () => {
    // Both end in ".\n\n", so the repetition could be read as starting three characters early.
    const paragraph = 'Vaccines train your immune system to recognize a germ without making you sick, so it can respond quickly later.\n\n';
    expect(kept('Here is how it works.\n\n' + paragraph.repeat(3))).toBe('Here is how it works.\n\n' + paragraph.trimEnd());
  });

  it('cuts at a line break when the sentence before the loop ends the way its copies do', () => {
    // Phi-4, planning a trip to Goa.
    const before = 'This information and experiences of this trip information and experiences may not fully meet your needs and preferences.\n\n';
    const copy = 'This information and experiences information and experiences may not fully meet your needs and preferences.\n\n';
    expect(kept('Day 3: Relax on the beach.\n\n' + before + copy.repeat(3))).toBe('Day 3: Relax on the beach.\n\n' + before + copy.trimEnd());
  });

  it('ignores short repeated phrases', () => {
    expect(repeatCut('Stir. '.repeat(4))).toBe(-1);
  });

  it('catches a short phrase once it has repeated for a long stretch, and keeps it once', () => {
    expect(kept('Ha! '.repeat(40))).toBe('Ha!');
    // Phi-4, asked why the sky is blue.
    const stuck = 'The sky appears blue because of Rayleigh scattering, and similarly' + ' and similarly'.repeat(12);
    expect(kept(stuck)).toBe('The sky appears blue because of Rayleigh scattering, and similarly');
  });

  it('leaves long rules of symbols alone', () => {
    expect(repeatCut('Results\n' + '='.repeat(200))).toBe(-1);
    expect(repeatCut('| a | b |\n' + '|---'.repeat(40))).toBe(-1);
  });

  it('handles text without spaces', () => {
    const sentence = '今天天气很好，我们一起去公园散步，然后在湖边喝茶聊天，晚上回家做饭。';
    expect(kept('好的：' + sentence.repeat(3))).toBe('好的：' + sentence);
  });
});
