import { describe, it, expect } from 'vitest';
import { CompressionEngine } from '../../src/codec/CompressionEngine.ts';

describe('CompressionEngine', () => {
    it('executes roundtrip deflate compression and decompression', async () => {
        const originalText = 'Deflate test metni. '.repeat(100);
        const originalBytes = new TextEncoder().encode(originalText);

        const compressed = await CompressionEngine.compress(originalBytes);
        expect(compressed.length).toBeLessThan(originalBytes.length);

        const decompressed = await CompressionEngine.decompress(compressed);
        const restoredText = new TextDecoder().decode(decompressed);
        expect(restoredText).toBe(originalText);
    });

    it('handles empty buffer gracefully', async () => {
        const emptyBytes = new Uint8Array(0);
        const compressed = await CompressionEngine.compress(emptyBytes);
        const decompressed = await CompressionEngine.decompress(compressed);
        expect(decompressed.length).toBe(0);
    });

    it('executes large payload compression roundtrip', async () => {
        const size = 64 * 1024;
        const largeData = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            largeData[i] = (i % 251) ^ (i & 0x0F);
        }

        const compressed = await CompressionEngine.compress(largeData);
        const decompressed = await CompressionEngine.decompress(compressed);

        expect(decompressed.length).toBe(size);
        expect(decompressed).toEqual(largeData);
    });
});
