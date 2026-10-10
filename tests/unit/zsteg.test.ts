import { describe, it, expect } from 'vitest';
import { ZstegScanner } from '../../src/forensics/ZstegScanner.ts';
import type { SimpleImageData } from '../../src/types/index.ts';

describe('ZstegScanner', () => {
    it('getCombinations returns exactly 56 unique combinations', () => {
        const combos = ZstegScanner.getCombinations();
        expect(combos.length).toBe(56);
        const uniqueIds = new Set(combos.map(c => c.id));
        expect(uniqueIds.size).toBe(56);
    });

    it('extractBytes correctly reconstructs embedded byte sequence', () => {
        const width = 16;
        const height = 16;
        const data = new Uint8ClampedArray(width * height * 4).fill(0);

        // Embed 'FLAG' (0x46, 0x4C, 0x41, 0x47) into red channel 1-LSB
        const targetBytes = [0x46, 0x4C, 0x41, 0x47];
        let p = 0;
        for (const b of targetBytes) {
            for (let bit = 0; bit < 8; bit++) {
                const bitVal = (b >> bit) & 1;
                data[p * 4] = bitVal; // Red channel
                p++;
            }
        }

        const img: SimpleImageData = { width, height, data };
        const combo = ZstegScanner.getCombinations().find(c => c.id === 'r,1b,lsb,xy');
        expect(combo).toBeDefined();

        const extracted = ZstegScanner.extractBytes(img, combo!, 4);
        expect(Array.from(extracted)).toEqual(targetBytes);
    });

    it('scan detects CTF flag in blue channel', () => {
        const width = 20;
        const height = 20;
        const data = new Uint8ClampedArray(width * height * 4).fill(0);

        // Embed 'flag{secret_ctf_token}' into blue channel 1-LSB
        const flagText = 'flag{ts_stego_flag_2026}';
        let p = 0;
        for (let i = 0; i < flagText.length; i++) {
            const code = flagText.charCodeAt(i);
            for (let bit = 0; bit < 8; bit++) {
                const bitVal = (code >> bit) & 1;
                data[p * 4 + 2] = bitVal; // Blue channel
                p++;
            }
        }

        const img: SimpleImageData = { width, height, data };
        const findings = ZstegScanner.scan(img);
        const flagFinding = findings.find(f => f.textSample.includes('flag{ts_stego_flag_2026}'));
        expect(flagFinding).toBeDefined();
        expect(flagFinding?.comboId).toBe('b,1b,lsb,xy');
    });
});
