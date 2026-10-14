import { describe, it, expect } from 'vitest';
import { notEnoughSpace, HEADROOM_BYTES } from '../disk-space';

const PHI_4 = 2_173_714_975;

describe('notEnoughSpace()', () => {
  it('stops the download that failed with 3.7 GB free, and says how much is needed', () => {
    expect(notEnoughSpace(3.7e9, PHI_4)).toBe(
      'Not enough disk space to download the AI model: it needs about 4.7 GB free, and this computer has 3.7 GB. Free up some space, then click Retry.',
    );
  });

  it('lets the download that worked with 4.9 GB free go ahead', () => {
    expect(notEnoughSpace(4.9e9, PHI_4)).toBeNull();
  });

  it('needs the download plus the headroom', () => {
    expect(notEnoughSpace(PHI_4 + HEADROOM_BYTES, PHI_4)).toBeNull();
    expect(notEnoughSpace(PHI_4 + HEADROOM_BYTES - 1, PHI_4)).not.toBeNull();
  });

  it('never shows the same number for what is free and what is needed', () => {
    const message = notEnoughSpace(PHI_4 + HEADROOM_BYTES - 1e6, PHI_4)!;
    const [needed, free] = [...message.matchAll(/(\d+\.\d) GB/g)].map((m) => m[1]);
    expect(Number(free)).toBeLessThan(Number(needed));
  });

  it('has nothing to say once the model is downloaded', () => {
    expect(notEnoughSpace(0, 0)).toBeNull();
  });
});
