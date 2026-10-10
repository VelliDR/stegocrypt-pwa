import { describe, it, expect } from 'vitest';
import { SteganalysisEngine } from '../../src/forensics/SteganalysisEngine.ts';
import { BinaryInspector } from '../../src/forensics/BinaryInspector.ts';
import { DiffEngine } from '../../src/forensics/DiffEngine.ts';
import { ZeroWidthDetector } from '../../src/forensics/ZeroWidthDetector.ts';
import { PngCodec } from '../../src/codec/PngCodec.ts';
import type { SimpleImageData } from '../../src/types/index.ts';

describe('Forensics & Steganalysis Engines', () => {
    it('Chi-Square and RS Analysis differentiate natural vs stego image', () => {
        const width = 100;
        const height = 100;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                data[idx] = (x * 2) % 256;
                data[idx + 1] = (y * 2) % 256;
                data[idx + 2] = ((x + y) * 2) % 256;
                data[idx + 3] = 255;
            }
        }

        const cleanImg: SimpleImageData = { width, height, data };
        const chiClean = SteganalysisEngine.analyzeChiSquare(cleanImg);
        expect(chiClean.isStego).toBe(false);

        const rsClean = SteganalysisEngine.analyzeRS(cleanImg);
        expect(rsClean.verdictLevel).toBe('clean');
    });

    it('DiffEngine computes MSE 0, PSNR Infinity, SSIM 1.0 on identical images', () => {
        const width = 32;
        const height = 32;
        const data = new Uint8ClampedArray(width * height * 4).fill(100);
        const img: SimpleImageData = { width, height, data };

        const comp = DiffEngine.compare(img, img);
        expect(comp.mse).toBe(0);
        expect(comp.psnr).toBe(Infinity);
        expect(comp.ssim).toBe(1.0);
        expect(comp.changedPixels).toBe(0);
    });

    it('BinaryInspector detects trailing data after IEND (overlay injection)', async () => {
        const width = 8;
        const height = 8;
        const data = new Uint8ClampedArray(width * height * 4).fill(200);
        const cleanPng = await PngCodec.encode({ width, height, data });

        // Inject ZIP file signature after IEND
        const zipBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
        const tampered = new Uint8Array(cleanPng.length + zipBytes.length);
        tampered.set(cleanPng, 0);
        tampered.set(zipBytes, cleanPng.length);

        const report = BinaryInspector.inspect(tampered);
        expect(report.format).toBe('png');
        expect(report.trailingData).not.toBeNull();
        expect(report.trailingData?.identifiedSignature).toContain('ZIP');
        expect(report.verdictLevel).toBe('alert');
    });

    it('ZeroWidthDetector detects invisible characters and Unicode Plane 14 tags', () => {
        const invisiblePayload = 'Hello\u200B\u200C\u200DWorld';
        const report = ZeroWidthDetector.analyze(invisiblePayload);
        expect(report.hasZeroWidth).toBe(true);
        expect(report.count).toBe(3);
        expect(report.cleanedText).toBe('HelloWorld');

        // Plane 14 tag ASCII smuggling
        const smuggled = 'Public' + String.fromCodePoint(0xE0061, 0xE0062, 0xE0063); // 'abc' in plane 14
        const reportSmuggled = ZeroWidthDetector.analyze(smuggled);
        expect(reportSmuggled.smuggledText).toBe('abc');
        expect(reportSmuggled.cleanedText).toBe('Public');
    });
});
