import { describe, it, expect } from 'vitest';
import { matchLsb1, matchLsb2 } from '../../src/stego/MatchingEngine.ts';

describe('MatchingEngine (LSB Matching ±1)', () => {
    it('matchLsb1 maintains value if LSB matches target', () => {
        expect(matchLsb1(10, 0)).toBe(10);
        expect(matchLsb1(11, 1)).toBe(11);
    });

    it('matchLsb1 clamps boundaries at 0 and 255', () => {
        // 0 (even), target 1 (odd) -> MUST become 1 (never -1)
        expect(matchLsb1(0, 1, false)).toBe(1);
        expect(matchLsb1(0, 1, true)).toBe(1);

        // 255 (odd), target 0 (even) -> MUST become 254 (never 256)
        expect(matchLsb1(255, 0, false)).toBe(254);
        expect(matchLsb1(255, 0, true)).toBe(254);
    });

    it('matchLsb1 toggles +1 or -1 based on random choice', () => {
        // 100 (even), target 1 -> choice false gives 99, choice true gives 101
        expect(matchLsb1(100, 1, false)).toBe(99);
        expect(matchLsb1(100, 1, true)).toBe(101);
    });

    it('matchLsb2 selects closest valid candidate with minimal absolute delta', () => {
        // 100 has LSB 0 (100 & 3 = 0). Target: 1 (diff +1 -> 101)
        expect(matchLsb2(100, 1)).toBe(101);
        // 100 to target 3 (diff -1 -> 99)
        expect(matchLsb2(100, 3)).toBe(99);
    });

    it('matchLsb2 clamps boundaries at 0 and 255', () => {
        const atZero = matchLsb2(0, 2);
        expect(atZero).toBeGreaterThanOrEqual(0);
        expect(atZero & 3).toBe(2);

        const at255 = matchLsb2(255, 0);
        expect(at255).toBeLessThanOrEqual(255);
        expect(at255 & 3).toBe(0);
    });
});
