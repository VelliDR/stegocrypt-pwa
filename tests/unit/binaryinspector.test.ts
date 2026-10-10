import { describe, it, expect } from 'vitest';
import { BinaryInspector } from '../../src/forensics/BinaryInspector.ts';
import { PngCodec } from '../../src/codec/PngCodec.ts';

describe('BinaryInspector', () => {
    it('detectFileType correctly identifies file formats', () => {
        // 1. PNG magic
        const pngMagic = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]);
        expect(BinaryInspector.detectFileType(pngMagic)).toBe('png');

        // 2. JPEG magic
        const jpegMagic = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 0]);
        expect(BinaryInspector.detectFileType(jpegMagic)).toBe('jpeg');

        // 3. WebP magic
        const webpMagic = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
        expect(BinaryInspector.detectFileType(webpMagic)).toBe('webp');

        // 4. Unknown
        const randomBytes = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
        expect(BinaryInspector.detectFileType(randomBytes)).toBe('unknown');
    });

    it('inspectPng extracts chunks, IHDR, and validates clean PNG', async () => {
        const width = 16;
        const height = 16;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 100;
            data[i + 1] = 150;
            data[i + 2] = 200;
            data[i + 3] = 255;
        }

        const pngBytes = await PngCodec.encode({ width, height, data });
        const report = BinaryInspector.inspectPng(pngBytes);

        expect(report.format).toBe('png');
        expect(report.verdictLevel).toBe('clean');
        expect(report.trailingData).toBeNull();
        expect(report.chunks!.length).toBeGreaterThanOrEqual(3); // IHDR, IDAT, IEND

        expect(report.ihdrInfo).toBeDefined();
        expect(report.ihdrInfo?.width).toBe(width);
        expect(report.ihdrInfo?.height).toBe(height);
        expect(report.ihdrInfo?.bitDepth).toBe(8);
        expect(report.ihdrInfo?.colorTypeName).toBe('RGBA');

        for (const chunk of report.chunks!) {
            expect(chunk.crcValid).toBe(true);
        }
    });

    it('detects trailing data after IEND (Overlay Injection) and identifies ZIP signature', async () => {
        const width = 8;
        const height = 8;
        const data = new Uint8ClampedArray(width * height * 4).fill(255);
        const validPngBytes = await PngCodec.encode({ width, height, data });

        // ZIP archive local header payload
        const zipPayload = new Uint8Array([
            0x50, 0x4B, 0x03, 0x04,
            0x14, 0x00, 0x00, 0x00,
            0x08, 0x00, 0x00, 0x00,
            0x54, 0x65, 0x73, 0x74
        ]);

        const injectedBytes = new Uint8Array(validPngBytes.length + zipPayload.length);
        injectedBytes.set(validPngBytes, 0);
        injectedBytes.set(zipPayload, validPngBytes.length);

        const report = BinaryInspector.inspectPng(injectedBytes);

        expect(report.verdictLevel).toBe('alert');
        expect(report.verdict).toMatch(/Overlay Injection|Gizli Veri/);
        expect(report.trailingData).toBeDefined();
        expect(report.trailingData?.length).toBe(zipPayload.length);
        expect(report.trailingData?.identifiedSignature).toContain('ZIP');
        expect(report.trailingData?.possibleExtension).toBe('zip');
    });

    it('detects corrupted chunk CRC in tampered PNG', async () => {
        const width = 8;
        const height = 8;
        const data = new Uint8ClampedArray(width * height * 4).fill(128);
        const pngBytes = await PngCodec.encode({ width, height, data });

        const tamperedBytes = new Uint8Array(pngBytes);
        tamperedBytes[42] ^= 0xFF; // Corrupt IDAT chunk data

        const report = BinaryInspector.inspectPng(tamperedBytes);
        expect(report.verdictLevel).toBe('alert');
        expect(report.verdict).toMatch(/CRC/);

        const idatChunk = report.chunks!.find(c => c.type === 'IDAT');
        expect(idatChunk).toBeDefined();
        expect(idatChunk?.crcValid).toBe(false);
    });

    it('inspects JPEG markers and verifies clean structure', () => {
        const jpegBytes = new Uint8Array([
            0xFF, 0xD8, // SOI
            0xFF, 0xE1, 0x00, 0x0A, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x01, 0x02, // APP1 Exif
            0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x10, 0x00, 0x20, 0x03, 0x01, 0x11, 0x00, // SOF0 (16x32)
            0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, // SOS
            0x12, 0x34, // entropy data
            0xFF, 0xD9  // EOI
        ]);

        const report = BinaryInspector.inspectJpeg(jpegBytes);
        expect(report.format).toBe('jpeg');
        expect(report.fileSize).toBe(jpegBytes.length);
        expect(report.trailingData).toBeNull();
        expect(report.verdictLevel).toBe('clean');
    });
});
