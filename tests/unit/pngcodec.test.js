import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PngCodec, crc32 } from '../../js/png/PngCodec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

test('PngCodec - Encode and Decode roundtrip produces 100% bit-exact RGBA pixels', async () => {
    const width = 64;
    const height = 48;
    const originalData = new Uint8ClampedArray(width * height * 4);

    // Fill with varied pixel values including low bits
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            originalData[idx] = (x * 7) & 0xFF;         // R
            originalData[idx + 1] = (y * 11) & 0xFF;    // G
            originalData[idx + 2] = ((x + y) * 13) & 0xFF; // B
            originalData[idx + 3] = 255;               // A
        }
    }

    // 1. Encode with PngCodec
    const pngBytes = await PngCodec.encode({ width, height, data: originalData });
    assert.ok(PngCodec.isPng(pngBytes), 'Output must be a valid PNG');

    // 2. Decode with PngCodec
    const decoded = await PngCodec.decode(pngBytes);
    assert.strictEqual(decoded.width, width);
    assert.strictEqual(decoded.height, height);
    assert.strictEqual(decoded.data.length, originalData.length);

    // 3. Verify every single byte matches exactly
    for (let i = 0; i < originalData.length; i++) {
        assert.strictEqual(decoded.data[i], originalData[i], `Pixel byte mismatch at offset ${i}`);
    }
});

test('PngCodec - Decodes external PNG fixture accurately', async () => {
    const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
    const carrierBuffer = fs.readFileSync(carrierPath);

    const decoded = await PngCodec.decode(carrierBuffer);
    assert.strictEqual(decoded.width, 100);
    assert.strictEqual(decoded.height, 100);
    assert.strictEqual(decoded.data.length, 100 * 100 * 4);
    assert.ok(decoded.chunks.some(c => c.type === 'IHDR'));
    assert.ok(decoded.chunks.some(c => c.type === 'IDAT'));
});

test('PngCodec - Rejects corrupted PNG with invalid CRC', async () => {
    const width = 16;
    const height = 16;
    const dummyData = new Uint8ClampedArray(width * height * 4);
    const validPng = await PngCodec.encode({ width, height, data: dummyData });

    // Corrupt one byte inside IDAT chunk data
    const corruptedPng = new Uint8Array(validPng);
    corruptedPng[40] ^= 0xFF;

    await assert.rejects(
        () => PngCodec.decode(corruptedPng),
        /CRC doğrulaması başarısız|Geçersiz/i
    );
});

test('PngCodec - CRC32 calculation matches standard Ethernet/PNG polynomial', () => {
    const testBytes = new TextEncoder().encode("123456789");
    const checkCrc = crc32(testBytes);
    // Standard CRC-32 check value for "123456789" is 0xCBF43926 (3421780262)
    assert.strictEqual(checkCrc, 0xCBF43926);
});
