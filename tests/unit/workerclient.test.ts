import { describe, it, expect } from 'vitest';
import { StegoWorkerClient } from '../../src/workers/StegoWorkerClient.ts';
import { PngCodec } from '../../src/codec/PngCodec.ts';

describe('StegoWorkerClient Integration & Fallback Pipeline', () => {
    it('executes ENCRYPT_V3 and DECRYPT_AUTO roundtrip end-to-end', async () => {
        const width = 64;
        const height = 64;
        const pixelData = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < pixelData.length; i += 4) {
            pixelData[i] = (i * 7) % 256;
            pixelData[i + 1] = (i * 13) % 256;
            pixelData[i + 2] = (i * 19) % 256;
            pixelData[i + 3] = 255;
        }

        const secretText = "StegoCrypt TypeScript v3.1.0 High-Security Roundtrip Payload";
        const rawBuffer = new TextEncoder().encode(secretText).buffer;
        const pass = "SuperSecurePassword_2026!#$";

        const encryptResult = await StegoWorkerClient.execute<{
            pngBytes: ArrayBuffer;
            pixelBuffer: ArrayBuffer;
            width: number;
            height: number;
        }>('ENCRYPT_V3', {
            pixelBuffer: pixelData.buffer,
            width,
            height,
            rawBuffer,
            pass,
            lsbMode: 1,
            method: 'matching',
            distribution: 'adaptive'
        });

        expect(encryptResult.pngBytes).toBeDefined();
        expect(encryptResult.pngBytes.byteLength).toBeGreaterThan(100);

        // Decode PNG bytes back to image pixels
        const decodedPng = await PngCodec.decode(new Uint8Array(encryptResult.pngBytes));
        expect(decodedPng.width).toBe(width);
        expect(decodedPng.height).toBe(height);

        // Decrypt automatically
        const decryptResult = await StegoWorkerClient.execute<{
            decryptedBytes: ArrayBuffer;
        }>('DECRYPT_AUTO', {
            pixelBuffer: decodedPng.data.buffer,
            width: decodedPng.width,
            height: decodedPng.height,
            password: pass
        });

        const recoveredText = new TextDecoder().decode(new Uint8Array(decryptResult.decryptedBytes));
        expect(recoveredText).toBe(secretText);
    });

    it('calculates steganography risk metrics via worker client', async () => {
        const width = 32;
        const height = 32;
        const pixelData = new Uint8ClampedArray(width * height * 4).fill(128);

        const result = await StegoWorkerClient.execute<{
            risk: {
                level: string;
                usagePercent: number;
                isTextureOverflow: boolean;
            };
        }>('CALCULATE_RISK', {
            pixelBuffer: pixelData.buffer,
            width,
            height,
            payloadBytes: 50,
            lsbMode: 1
        });

        expect(result.risk).toBeDefined();
        expect(result.risk.usagePercent).toBeGreaterThan(0);
        expect(result.risk.level).toBeDefined();
    });

    it('inspects binary PNG format via worker client', async () => {
        const width = 16;
        const height = 16;
        const pixelData = new Uint8ClampedArray(width * height * 4).fill(100);
        const png = await PngCodec.encode({ width, height, data: pixelData });

        const result = await StegoWorkerClient.execute<{
            report: {
                format: string;
                fileSize: number;
                verdictLevel: string;
                trailingData: any;
            };
        }>('INSPECT_BINARY', {
            fileBuffer: png.buffer
        });

        expect(result.report.format).toBe('png');
        expect(result.report.fileSize).toBe(png.length);
        expect(result.report.verdictLevel).toBe('clean');
        expect(result.report.trailingData).toBeNull();
    });
});
