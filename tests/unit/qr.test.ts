import { describe, it, expect } from 'vitest';
import { QREngine } from '../../src/codec/QREngine.ts';

describe('QREngine TypeScript Port & UTF-8 / Zero-Width Pipeline', () => {
    it('creates QRCode model and generates SimpleImageData with expected dimensions', () => {
        const text = "Hello StegoCrypt QR";
        const imgData = QREngine.generateImageData(text, { level: 'M', scale: 4, margin: 4 });

        expect(imgData.width).toBeGreaterThan(0);
        expect(imgData.height).toBe(imgData.width);
        expect(imgData.data.length).toBe(imgData.width * imgData.height * 4);

        // Check that background contains white pixels (255, 255, 255, 255)
        expect(imgData.data[0]).toBe(255);
        expect(imgData.data[1]).toBe(255);
        expect(imgData.data[2]).toBe(255);
        expect(imgData.data[3]).toBe(255);
    });

    it('encodes and decodes standard ASCII text end-to-end', async () => {
        const payload = "https://github.com/VelliDR/stegocrypt-pwa/releases/tag/v3.1.0";
        const imgData = QREngine.generateImageData(payload, { level: 'M', scale: 5 });

        const decoded = await QREngine.scanFromImageData(imgData);
        expect(decoded).toBe(payload);
    });

    it('preserves UTF-8 Turkish and Zero-Width invisible characters without corruption', async () => {
        // Zero-width characters (U+200B, U+200C, U+200D) + Turkish characters
        const zwPayload = "Başlık: Gizli Belge \u200B\u200C\u200D Türkçe: ğüşiöç 123456";
        const imgData = QREngine.generateImageData(zwPayload, { level: 'M', scale: 4 });

        const decoded = await QREngine.scanFromImageData(imgData);
        expect(decoded).toBe(zwPayload);
        expect(decoded).toContain('\u200B');
        expect(decoded).toContain('\u200C');
        expect(decoded).toContain('\u200D');
        expect(decoded).toContain('ğüşiöç');
    });

    it('supports different error correction levels (L, M, Q, H)', async () => {
        const payload = "Error Correction Verification";
        const levels: Array<'L' | 'M' | 'Q' | 'H'> = ['L', 'M', 'Q', 'H'];

        for (const level of levels) {
            const imgData = QREngine.generateImageData(payload, { level, scale: 4 });
            const decoded = await QREngine.scanFromImageData(imgData);
            expect(decoded).toBe(payload);
        }
    });

    it('enforces MAX_QR_BYTES limit and throws descriptive error on oversized payloads', () => {
        // 2350 bytes payload
        const oversized = 'A'.repeat(2350);
        expect(() => {
            QREngine.createQR(oversized);
        }).toThrow(/Veri çok büyük/);
    });

    it('rejects empty or invalid input', () => {
        expect(() => {
            QREngine.createQR("");
        }).toThrow(/geçerli bir metin/);
    });
});
