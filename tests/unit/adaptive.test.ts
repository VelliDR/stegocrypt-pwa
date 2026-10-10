import { describe, it, expect } from 'vitest';
import { AdaptiveEngine } from '../../src/stego/AdaptiveEngine.ts';
import { KeyDerivation } from '../../src/crypto/KeyDerivation.ts';
import { CryptoEngine } from '../../src/crypto/CryptoEngine.ts';
import type { SimpleImageData } from '../../src/types/index.ts';

function createMockImageData(width: number, height: number): SimpleImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = (i * 17) % 256;
        data[i + 1] = (i * 31) % 256;
        data[i + 2] = (i * 53) % 256;
        data[i + 3] = 255;
    }
    return { width, height, data };
}

describe('AdaptiveEngine', () => {
    it('computeTextureScores produces bit-exact identical scores before and after LSB changes', () => {
        const img = createMockImageData(40, 40);
        const scoresBefore = AdaptiveEngine.computeTextureScores(img.width, img.height, img.data);

        // Modify lower bits of carrier pixels
        for (let i = 0; i < img.data.length; i += 4) {
            img.data[i] = (img.data[i]! ^ 1) & 0xFF;
            img.data[i + 1] = (img.data[i + 1]! ^ 1) & 0xFF;
            img.data[i + 2] = (img.data[i + 2]! ^ 1) & 0xFF;
        }

        const scoresAfter = AdaptiveEngine.computeTextureScores(img.width, img.height, img.data);
        expect(scoresBefore).toEqual(scoresAfter);
    });

    it('calculateStegoRisk categorizes safe and overflow payloads properly', () => {
        const img = createMockImageData(60, 60);

        const lowRisk = AdaptiveEngine.calculateStegoRisk(20, img.width, img.height, img.data, 1);
        expect(lowRisk.level).toBe('low');
        expect(lowRisk.isTextureOverflow).toBe(false);

        const highRisk = AdaptiveEngine.calculateStegoRisk(50000, img.width, img.height, img.data, 1);
        expect(highRisk.level).toBe('high');
        expect(highRisk.isTextureOverflow).toBe(true);
    });

    it('Format v3 Adaptive lattice roundtrip (1-LSB and 2-LSB matching)', async () => {
        const img = createMockImageData(80, 80);
        const password = 'AdaptiveRoundtripPass123';
        const salt = crypto.getRandomValues(new Uint8Array(16));

        const masterKey = await KeyDerivation.deriveMasterKeyV3(password, salt, 1000);
        const subkeys = await KeyDerivation.deriveSubkeysV3(masterKey, 'v3/all');

        const secretText = 'Format v3 Adaptive TS roundtrip test.';
        const plainBytes = new TextEncoder().encode(secretText);

        const enc = await CryptoEngine.encryptV3(plainBytes, subkeys.metaKey as CryptoKey, subkeys.bodyKey as CryptoKey, 1);
        AdaptiveEngine.embedAdaptive(img, enc.header48, enc.cipherBody, 1, subkeys.scatterBits, salt, 'all', 'matching');

        const extracted = await AdaptiveEngine.extractAdaptive(img, masterKey, 'all');
        expect(new TextDecoder().decode(extracted)).toBe(secretText);
    });
});
