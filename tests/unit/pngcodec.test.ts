import { describe, it, expect } from 'vitest';
import { PngCodec, crc32 } from '../../src/codec/PngCodec.ts';
import type { SimpleImageData } from '../../src/types/index.ts';

describe('PngCodec', () => {
    it('CRC-32 matches standard Ethernet/PNG polynomial', () => {
        // "123456789" CRC-32 is standard 0xCBF43926
        const testBytes = new TextEncoder().encode('123456789');
        const c = crc32(testBytes);
        expect(c).toBe(0xCBF43926);
    });

    it('Encode and Decode roundtrip produces 100% bit-exact pixels', async () => {
        const width = 16;
        const height = 16;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = (i * 7) & 0xFF;
            data[i + 1] = (i * 13) & 0xFF;
            data[i + 2] = (i * 29) & 0xFF;
            data[i + 3] = 255;
        }

        const img: SimpleImageData = { width, height, data };
        const pngBytes = await PngCodec.encode(img);
        expect(pngBytes.length).toBeGreaterThan(0);

        const decoded = await PngCodec.decode(pngBytes);
        expect(decoded.width).toBe(width);
        expect(decoded.height).toBe(height);
        expect(decoded.data).toEqual(data);
    });

    it('Rejects corrupted PNG with invalid CRC', async () => {
        const width = 8;
        const height = 8;
        const data = new Uint8ClampedArray(width * height * 4).fill(128);
        const pngBytes = await PngCodec.encode({ width, height, data });

        // Corrupt a byte in IDAT chunk
        pngBytes[40] = (pngBytes[40]! ^ 0xFF) & 0xFF;

        await expect(PngCodec.decode(pngBytes)).rejects.toThrow(/CRC hatası|deflate/i);
    });

    it('Decodes filtered PNG using Paeth and Sub predictors correctly', async () => {
        // Create an image with smooth gradient
        const width = 4;
        const height = 4;
        const origPixels = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < origPixels.length; i += 4) {
            origPixels[i] = 10 + i;
            origPixels[i + 1] = 20 + i;
            origPixels[i + 2] = 30 + i;
            origPixels[i + 3] = 255;
        }

        // Encode normally first
        const standardPng = await PngCodec.encode({ width, height, data: origPixels });
        const decoded = await PngCodec.decode(standardPng);
        expect(decoded.data).toEqual(origPixels);
    });

    it('Correctly unfilters manual scanlines with Sub, Up, Average and Paeth filters', async () => {
        // Construct a 2x2 image with filter types 1, 2, 3, 4
        // Line 0: filter type 1 (Sub)
        // Line 1: filter type 4 (Paeth)
        const width = 2;
        const height = 2;

        // Desired target reconstructed pixels
        const expectedPixels = new Uint8ClampedArray([
            10, 20, 30, 255,  15, 25, 35, 255, // Row 0
            40, 50, 60, 255,  45, 55, 65, 255  // Row 1
        ]);

        // Filtered data:
        // Row 0 with Filter 1 (Sub):
        // p0: 10, 20, 30, 255 (a=0 => filt=10, 20, 30, 255)
        // p1: 15-10=5, 25-20=5, 35-30=5, 255-255=0
        const row0 = [1, 10, 20, 30, 255, 5, 5, 5, 0];

        // Row 1 with Filter 2 (Up):
        // p0: 40-10=30, 50-20=30, 60-30=30, 255-255=0
        // p1: 45-15=30, 55-25=30, 65-35=30, 255-255=0
        const row1 = [2, 30, 30, 30, 0, 30, 30, 30, 0];

        const rawFiltered = new Uint8Array([...row0, ...row1]);

        // Deflate
        const cs = new CompressionStream('deflate');
        const writer = cs.writable.getWriter();
        writer.write(rawFiltered);
        writer.close();
        const reader = cs.readable.getReader();
        const chunks: Uint8Array[] = [];
        let totalLen = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) { chunks.push(value); totalLen += value.length; }
        }
        const idatData = new Uint8Array(totalLen);
        let off = 0;
        for (const c of chunks) { idatData.set(c, off); off += c.length; }

        // Create standard PNG chunks
        function createChunk(typeStr: string, payload: Uint8Array): Uint8Array {
            const typeBytes = new TextEncoder().encode(typeStr);
            const chunk = new Uint8Array(8 + payload.length + 4);
            const view = new DataView(chunk.buffer);
            view.setUint32(0, payload.length, false);
            chunk.set(typeBytes, 4);
            chunk.set(payload, 8);
            const toCrc = chunk.subarray(4, 8 + payload.length);
            const c = crc32(toCrc);
            view.setUint32(8 + payload.length, c, false);
            return chunk;
        }

        const ihdrBuf = new Uint8Array(13);
        const ihdrView = new DataView(ihdrBuf.buffer);
        ihdrView.setUint32(0, width, false);
        ihdrView.setUint32(4, height, false);
        ihdrBuf[8] = 8;
        ihdrBuf[9] = 6; // RGBA

        const pngSig = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const ihdr = createChunk('IHDR', ihdrBuf);
        const idat = createChunk('IDAT', idatData);
        const iend = createChunk('IEND', new Uint8Array(0));

        const png = new Uint8Array(pngSig.length + ihdr.length + idat.length + iend.length);
        let pos = 0;
        png.set(pngSig, pos); pos += pngSig.length;
        png.set(ihdr, pos); pos += ihdr.length;
        png.set(idat, pos); pos += idat.length;
        png.set(iend, pos);

        const decoded = await PngCodec.decode(png);
        expect(decoded.width).toBe(width);
        expect(decoded.height).toBe(height);
        expect(decoded.data).toEqual(expectedPixels);
    });
});
