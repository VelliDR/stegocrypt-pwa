import { describe, it, expect } from 'vitest';
import { VariationSelectorEngine } from '../../src/stego/VariationSelectorEngine.ts';
import { CryptoEngine } from '../../src/crypto/CryptoEngine.ts';

describe('VariationSelectorEngine (Emoji / VS1-VS16 Steganography)', () => {
    it('encodes and extracts binary payload behind emoji carrier', () => {
        const payload = new Uint8Array([0x00, 0x12, 0xAB, 0xCD, 0xEF, 0xFF]);
        const carrier = '🚀';

        const stego = VariationSelectorEngine.encode(payload, carrier);
        expect(stego.startsWith('🚀')).toBe(true);
        expect(stego.length).toBeGreaterThan(carrier.length);

        const extracted = VariationSelectorEngine.extract(stego);
        expect(extracted).toEqual(payload);
    });

    it('encodes and decodes UTF-8 string end-to-end', () => {
        const secret = "Gizli koordinatlar: 41.0082° N, 28.9784° E (İstanbul) 🌿";
        const stego = VariationSelectorEngine.encodeString(secret, '🛡️');

        expect(VariationSelectorEngine.hasVariationSelectors(stego)).toBe(true);

        const decoded = VariationSelectorEngine.decodeString(stego);
        expect(decoded).toBe(secret);
    });

    it('works across different emoji carriers and embedded sentence contexts', () => {
        const secret = "Mission Accomplished";
        const carrierSentence = "Toplantı bitti, detaylar burada 🐱";

        const stego = VariationSelectorEngine.encodeString(secret, carrierSentence);
        expect(stego.startsWith(carrierSentence)).toBe(true);

        const decoded = VariationSelectorEngine.decodeString(stego);
        expect(decoded).toBe(secret);
    });

    it('throws error when no variation selector is present', () => {
        expect(() => {
            VariationSelectorEngine.extract("Normal sentence without any selectors");
        }).toThrow(/bulunamadı/);
    });

    it('integrates seamlessly with CryptoEngine AES-256-GCM encrypted payload', async () => {
        const confidential = "SUPER_SECRET_TOKEN_987654321";
        const password = "HardToGuessPassword!123";

        const rawBytes = new TextEncoder().encode(confidential);
        const encryptedBytes = await CryptoEngine.encryptBuffer(rawBytes, password);

        // Embed encrypted bytes into emoji carrier
        const emojiStego = VariationSelectorEngine.encode(encryptedBytes, '✨');

        // Extract and decrypt
        const extractedEncrypted = VariationSelectorEngine.extract(emojiStego);
        const decryptedBytes = await CryptoEngine.decryptBuffer(extractedEncrypted, password);
        const revealed = new TextDecoder().decode(decryptedBytes);

        expect(revealed).toBe(confidential);
    });
});
