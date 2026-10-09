import test from 'node:test';
import assert from 'node:assert/strict';
import { CompressionEngine } from '../../js/CompressionEngine.js';

test('CompressionEngine - Roundtrip deflate compression and decompression', async () => {
    const originalText = 'Deflate test metni. '.repeat(100);
    const originalBytes = new TextEncoder().encode(originalText);

    const compressed = await CompressionEngine.compress(originalBytes);
    assert.ok(compressed.length < originalBytes.length, 'Repetitive text should compress well');

    const decompressed = await CompressionEngine.decompress(compressed);
    const restoredText = new TextDecoder().decode(decompressed);
    assert.strictEqual(restoredText, originalText);
});

test('CompressionEngine - Handles empty buffer gracefully', async () => {
    const emptyBytes = new Uint8Array(0);
    const compressed = await CompressionEngine.compress(emptyBytes);
    const decompressed = await CompressionEngine.decompress(compressed);
    assert.strictEqual(decompressed.length, 0);
});

test('CompressionEngine - Large payload compression roundtrip', async () => {
    // 64 KB of semi-random patterned data
    const size = 64 * 1024;
    const largeData = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        largeData[i] = (i % 251) ^ (i & 0x0F);
    }

    const compressed = await CompressionEngine.compress(largeData);
    const decompressed = await CompressionEngine.decompress(compressed);

    assert.strictEqual(decompressed.length, size);
    assert.deepStrictEqual(decompressed, largeData);
});
