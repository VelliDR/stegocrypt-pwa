/**
 * src/codec/PngCodec.ts
 * Saf, Deterministik ve Canvas-Bağımsız PNG Kodlayıcı ve Ayrıştırıcı.
 * Tarayıcı canvas farbling, alfa premultiplication ve ICC renk profili bozulmalarını %100 baypas eder.
 */

import type { SimpleImageData } from '../types/index.ts';

// Standart IEEE 802.3 CRC-32 Tablosu
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[n] = c >>> 0;
}

export function crc32(buf: Uint8Array, prev: number = 0): number {
    let c = (prev ^ (-1)) >>> 0;
    for (let i = 0; i < buf.length; i++) {
        c = (CRC_TABLE[(c ^ buf[i]!) & 0xFF]! ^ (c >>> 8)) >>> 0;
    }
    return (c ^ (-1)) >>> 0;
}

async function deflateRaw(rawBytes: Uint8Array): Promise<Uint8Array> {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(rawBytes as unknown as BufferSource);
    writer.close();
    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            totalLen += value.length;
        }
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

async function inflateRaw(compressedBytes: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(compressedBytes as unknown as BufferSource);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
            chunks.push(value);
            totalLen += value.length;
        }
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }
    return result;
}

export const PngCodec = {
    crc32,

    /**
     * RGBA piksellerini saf PNG bayt dizisine kodlar.
     */
    async encode(img: SimpleImageData): Promise<Uint8Array> {
        const { width, height, data } = img;
        const scanlineLen = 1 + width * 4;
        const rawFiltered = new Uint8Array(height * scanlineLen);

        for (let y = 0; y < height; y++) {
            const rowOffset = y * scanlineLen;
            rawFiltered[rowOffset] = 0; // Filter Type 0 (None)
            const srcStart = y * width * 4;
            rawFiltered.set(data.subarray(srcStart, srcStart + width * 4), rowOffset + 1);
        }

        const idatData = await deflateRaw(rawFiltered);

        const ihdrBuf = new Uint8Array(13);
        const ihdrView = new DataView(ihdrBuf.buffer);
        ihdrView.setUint32(0, width, false);
        ihdrView.setUint32(4, height, false);
        ihdrBuf[8] = 8;  // Bit depth: 8
        ihdrBuf[9] = 6;  // Color type: 6 (RGBA)
        ihdrBuf[10] = 0; // Compression: 0 (Deflate)
        ihdrBuf[11] = 0; // Filter: 0 (Standard)
        ihdrBuf[12] = 0; // Interlace: 0 (None)

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

        const pngSignature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const ihdrChunk = createChunk('IHDR', ihdrBuf);
        const idatChunk = createChunk('IDAT', idatData);
        const iendChunk = createChunk('IEND', new Uint8Array(0));

        const totalLen = pngSignature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
        const out = new Uint8Array(totalLen);
        let pos = 0;
        out.set(pngSignature, pos); pos += pngSignature.length;
        out.set(ihdrChunk, pos); pos += ihdrChunk.length;
        out.set(idatChunk, pos); pos += idatChunk.length;
        out.set(iendChunk, pos);

        return out;
    },

    /**
     * Saf PNG dosyasını RGBA piksellerine ayrıştırır.
     */
    async decode(buffer: ArrayBuffer | Uint8Array): Promise<SimpleImageData> {
        const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

        // PNG İmzası Kontrolü
        if (u8.length < 8 ||
            u8[0] !== 0x89 || u8[1] !== 0x50 || u8[2] !== 0x4E || u8[3] !== 0x47 ||
            u8[4] !== 0x0D || u8[5] !== 0x0A || u8[6] !== 0x1A || u8[7] !== 0x0A) {
            throw new Error("Geçersiz PNG dosya imzası.");
        }

        let width = 0;
        let height = 0;
        let bitDepth = 0;
        let colorType = 0;
        const idatChunks: Uint8Array[] = [];

        let offset = 8;
        while (offset + 8 <= u8.length) {
            const length = view.getUint32(offset, false);
            const type = new TextDecoder().decode(u8.subarray(offset + 4, offset + 8));
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;

            if (dataEnd + 4 > u8.length) {
                throw new Error(`Bozuk PNG: ${type} chunk'ı dosya sonunu aşıyor.`);
            }

            const chunkCrc = view.getUint32(dataEnd, false);
            const calculatedCrc = crc32(u8.subarray(offset + 4, dataEnd));
            if (chunkCrc !== calculatedCrc) {
                throw new Error(`CRC hatası: ${type} chunk'ı tahrif edilmiş.`);
            }

            if (type === 'IHDR') {
                width = view.getUint32(dataStart, false);
                height = view.getUint32(dataStart + 4, false);
                bitDepth = u8[dataStart + 8]!;
                colorType = u8[dataStart + 9]!;
            } else if (type === 'IDAT') {
                idatChunks.push(u8.subarray(dataStart, dataEnd));
            } else if (type === 'IEND') {
                break;
            }

            offset = dataEnd + 4;
        }

        if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2 && colorType !== 0)) {
            throw new Error(`Yalnızca 8-bit RGBA (Type 6), RGB (Type 2) veya Grayscale (Type 0) PNG formatları desteklenir (Bulunan: ColorType ${colorType}, BitDepth ${bitDepth}).`);
        }

        let totalIdatLen = 0;
        for (const c of idatChunks) totalIdatLen += c.length;
        const combinedIdat = new Uint8Array(totalIdatLen);
        let idatOffset = 0;
        for (const c of idatChunks) {
            combinedIdat.set(c, idatOffset);
            idatOffset += c.length;
        }

        const uncompressed = await inflateRaw(combinedIdat);
        const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
        const lineBytes = width * bpp;
        const scanlineLen = 1 + lineBytes;

        if (uncompressed.length < height * scanlineLen) {
            throw new Error("Bozuk PNG IDAT: Açılan veri görsel boyutundan kısa.");
        }

        const recon = new Uint8Array(height * lineBytes);

        function paethPredictor(a: number, b: number, c: number): number {
            const p = a + b - c;
            const pa = Math.abs(p - a);
            const pb = Math.abs(p - b);
            const pc = Math.abs(p - c);
            if (pa <= pb && pa <= pc) return a;
            if (pb <= pc) return b;
            return c;
        }

        for (let y = 0; y < height; y++) {
            const filterType = uncompressed[y * scanlineLen]!;
            const srcRow = y * scanlineLen + 1;
            const dstRow = y * lineBytes;
            const prevRow = (y - 1) * lineBytes;

            for (let x = 0; x < lineBytes; x++) {
                const filtVal = uncompressed[srcRow + x]!;
                const a = (x >= bpp) ? recon[dstRow + x - bpp]! : 0;
                const b = (y > 0) ? recon[prevRow + x]! : 0;
                const c = (y > 0 && x >= bpp) ? recon[prevRow + x - bpp]! : 0;

                let reconVal = 0;
                switch (filterType) {
                    case 0: // None
                        reconVal = filtVal;
                        break;
                    case 1: // Sub
                        reconVal = (filtVal + a) & 0xFF;
                        break;
                    case 2: // Up
                        reconVal = (filtVal + b) & 0xFF;
                        break;
                    case 3: // Average
                        reconVal = (filtVal + Math.floor((a + b) / 2)) & 0xFF;
                        break;
                    case 4: // Paeth
                        reconVal = (filtVal + paethPredictor(a, b, c)) & 0xFF;
                        break;
                    default:
                        throw new Error(`Geçersiz PNG filtre türü (${filterType}).`);
                }
                recon[dstRow + x] = reconVal;
            }
        }

        // Pikselleri her zaman 32-bit RGBA (SimpleImageData) formatına normalize et
        const pixels = new Uint8ClampedArray(width * height * 4);
        if (colorType === 6) {
            pixels.set(recon);
        } else if (colorType === 2) {
            for (let p = 0; p < width * height; p++) {
                const srcIdx = p * 3;
                const dstIdx = p * 4;
                pixels[dstIdx] = recon[srcIdx]!;
                pixels[dstIdx + 1] = recon[srcIdx + 1]!;
                pixels[dstIdx + 2] = recon[srcIdx + 2]!;
                pixels[dstIdx + 3] = 255;
            }
        } else {
            for (let p = 0; p < width * height; p++) {
                const g = recon[p]!;
                const dstIdx = p * 4;
                pixels[dstIdx] = g;
                pixels[dstIdx + 1] = g;
                pixels[dstIdx + 2] = g;
                pixels[dstIdx + 3] = 255;
            }
        }

        return { width, height, data: pixels };
    }
};
