/**
 * js/png/PngCodec.js (Faz 2: Saf İstemci Taraflı Deterministik PNG Çözücü ve Kodlayıcı)
 * - Tarayıcı <canvas>'ını tamamen devre dışı bırakarak bit düzeyinde %100 determinizm sağlar.
 * - Premultiplied alpha ve canvas farbling / profil yuvarlama bozulmalarını sıfırlar.
 * - Streams API (CompressionStream / DecompressionStream 'deflate') ile yerel zlib desteği.
 * - Desteklenen formatlar: 8-bit RGBA (Type 6), RGB (Type 2), Grayscale (Type 0), Indexed (Type 3).
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// CRC-32 Lookup Table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c >>> 0;
}

export function crc32(buf, offset = 0, length = buf.length) {
    let crc = 0xFFFFFFFF;
    const end = offset + length;
    for (let i = offset; i < end; i++) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

async function decompressDeflate(compressedUint8Array) {
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(compressedUint8Array);
    writer.close();

    const reader = ds.readable.getReader();
    const chunks = [];
    let totalLen = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLen += value.length;
    }

    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }
    return merged;
}

async function compressDeflate(uncompressedUint8Array) {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(uncompressedUint8Array);
    writer.close();

    const reader = cs.readable.getReader();
    const chunks = [];
    let totalLen = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLen += value.length;
    }

    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }
    return merged;
}

export const PngCodec = {
    /**
     * Verilen ArrayBuffer veya Uint8Array'in geçerli bir PNG imzasına sahip olup olmadığını denetler.
     * @param {ArrayBuffer|Uint8Array} buffer
     * @returns {boolean}
     */
    isPng(buffer) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        if (bytes.length < 8) return false;
        for (let i = 0; i < 8; i++) {
            if (bytes[i] !== PNG_SIGNATURE[i]) return false;
        }
        return true;
    },

    /**
     * Saf JavaScript ile PNG baytlarını ayrıştırır ve pikselleri RGBA ImageData formatında çözer.
     * @param {ArrayBuffer|Uint8Array} buffer
     * @returns {Promise<{ width: number, height: number, data: Uint8ClampedArray, colorType: number, bitDepth: number, chunks: Array<{ type: string, length: number }> }>}
     */
    async decode(buffer) {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        if (!this.isPng(bytes)) {
            throw new Error("Geçersiz PNG imzası.");
        }

        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let pos = 8; // İmzayı atla

        let width = 0;
        let height = 0;
        let bitDepth = 0;
        let colorType = 0;
        let compressionMethod = 0;
        let filterMethod = 0;
        let interlaceMethod = 0;

        let palette = null;
        const idatChunks = [];
        let totalIdatLength = 0;
        const parsedChunks = [];

        while (pos < bytes.length) {
            if (pos + 8 > bytes.length) break;
            const chunkLen = view.getUint32(pos, false);
            const typeStr = String.fromCharCode(
                bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]
            );

            const dataStart = pos + 8;
            const dataEnd = dataStart + chunkLen;
            const crcPos = dataEnd;

            if (crcPos + 4 > bytes.length) {
                throw new Error(`Bozuk PNG paketi: ${typeStr} chunk verisi eksik.`);
            }

            const expectedCrc = view.getUint32(crcPos, false);
            const calculatedCrc = crc32(bytes, pos + 4, chunkLen + 4);
            if (expectedCrc !== calculatedCrc) {
                throw new Error(`PNG CRC doğrulaması başarısız (${typeStr} chunk).`);
            }

            parsedChunks.push({ type: typeStr, length: chunkLen });

            if (typeStr === 'IHDR') {
                width = view.getUint32(dataStart, false);
                height = view.getUint32(dataStart + 4, false);
                bitDepth = bytes[dataStart + 8];
                colorType = bytes[dataStart + 9];
                compressionMethod = bytes[dataStart + 10];
                filterMethod = bytes[dataStart + 11];
                interlaceMethod = bytes[dataStart + 12];

                if (interlaceMethod !== 0) {
                    throw new Error("Interlaced (Adam7) PNG desteklenmiyor; lütfen standart PNG kullanın.");
                }
                if (bitDepth !== 8) {
                    throw new Error(`Yalnızca 8-bit PNG desteklenmektedir (Mevcut: ${bitDepth}-bit).`);
                }
            } else if (typeStr === 'PLTE') {
                palette = bytes.subarray(dataStart, dataEnd);
            } else if (typeStr === 'IDAT') {
                const chunkData = bytes.subarray(dataStart, dataEnd);
                idatChunks.push(chunkData);
                totalIdatLength += chunkLen;
            } else if (typeStr === 'IEND') {
                break;
            }

            pos = crcPos + 4;
        }

        if (width === 0 || height === 0 || idatChunks.length === 0) {
            throw new Error("PNG ayrıştırma hatası: IHDR veya IDAT verisi bulunamadı.");
        }

        // Tüm IDAT verilerini birleştir
        const combinedIdat = new Uint8Array(totalIdatLength);
        let idatOffset = 0;
        for (const chunk of idatChunks) {
            combinedIdat.set(chunk, idatOffset);
            idatOffset += chunk.length;
        }

        // Zlib Deflate akışını aç
        const uncompressed = await decompressDeflate(combinedIdat);

        // Kanal ve bpp (bayt / piksel) hesabı
        let bpp = 4; // default RGBA
        if (colorType === 2) bpp = 3;      // RGB
        else if (colorType === 0) bpp = 1; // Grayscale
        else if (colorType === 3) bpp = 1; // Indexed
        else if (colorType === 4) bpp = 2; // Grayscale + Alpha
        else if (colorType === 6) bpp = 4; // RGBA
        else {
            throw new Error(`Desteklenmeyen PNG renk türü: ${colorType}`);
        }

        const scanlineLen = 1 + width * bpp;
        if (uncompressed.length < height * scanlineLen) {
            throw new Error("Açılan PNG veri boyutu beklenen piksel çözünürlüğü ile uyuşmuyor.");
        }

        // Satır satır filtreleri geri al (Unfiltering)
        const reconstructed = new Uint8Array(height * width * bpp);
        let srcOffset = 0;

        for (let y = 0; y < height; y++) {
            const filterType = uncompressed[srcOffset++];
            const rowStart = y * width * bpp;
            const priorRowStart = (y - 1) * width * bpp;

            for (let x = 0; x < width * bpp; x++) {
                const raw = uncompressed[srcOffset++];
                const a = x >= bpp ? reconstructed[rowStart + x - bpp] : 0;
                const b = y > 0 ? reconstructed[priorRowStart + x] : 0;
                const c = (y > 0 && x >= bpp) ? reconstructed[priorRowStart + x - bpp] : 0;

                let recon = 0;
                if (filterType === 0) {
                    // None
                    recon = raw;
                } else if (filterType === 1) {
                    // Sub
                    recon = (raw + a) & 0xFF;
                } else if (filterType === 2) {
                    // Up
                    recon = (raw + b) & 0xFF;
                } else if (filterType === 3) {
                    // Average
                    recon = (raw + Math.floor((a + b) / 2)) & 0xFF;
                } else if (filterType === 4) {
                    // Paeth
                    recon = (raw + paethPredictor(a, b, c)) & 0xFF;
                } else {
                    throw new Error(`Bilinmeyen PNG filtre tipi: ${filterType}`);
                }

                reconstructed[rowStart + x] = recon;
            }
        }

        // Çıktıyı standart RGBA Uint8ClampedArray'e dönüştür
        const rgbaData = new Uint8ClampedArray(width * height * 4);
        let dstIdx = 0;

        if (colorType === 6) {
            // Doğrudan RGBA
            rgbaData.set(reconstructed);
        } else if (colorType === 2) {
            // RGB -> RGBA (Alfa = 255)
            let srcIdx = 0;
            const totalPixels = width * height;
            for (let p = 0; p < totalPixels; p++) {
                rgbaData[dstIdx++] = reconstructed[srcIdx++];
                rgbaData[dstIdx++] = reconstructed[srcIdx++];
                rgbaData[dstIdx++] = reconstructed[srcIdx++];
                rgbaData[dstIdx++] = 255;
            }
        } else if (colorType === 0) {
            // Grayscale -> RGBA
            const totalPixels = width * height;
            for (let p = 0; p < totalPixels; p++) {
                const g = reconstructed[p];
                rgbaData[dstIdx++] = g;
                rgbaData[dstIdx++] = g;
                rgbaData[dstIdx++] = g;
                rgbaData[dstIdx++] = 255;
            }
        } else if (colorType === 3) {
            // Indexed Palette -> RGBA
            if (!palette) throw new Error("Paletli PNG için PLTE tablosu eksik.");
            const totalPixels = width * height;
            for (let p = 0; p < totalPixels; p++) {
                const colorIdx = reconstructed[p];
                const palOffset = colorIdx * 3;
                rgbaData[dstIdx++] = palette[palOffset] || 0;
                rgbaData[dstIdx++] = palette[palOffset + 1] || 0;
                rgbaData[dstIdx++] = palette[palOffset + 2] || 0;
                rgbaData[dstIdx++] = 255;
            }
        } else if (colorType === 4) {
            // Grayscale + Alpha -> RGBA
            let srcIdx = 0;
            const totalPixels = width * height;
            for (let p = 0; p < totalPixels; p++) {
                const g = reconstructed[srcIdx++];
                const a = reconstructed[srcIdx++];
                rgbaData[dstIdx++] = g;
                rgbaData[dstIdx++] = g;
                rgbaData[dstIdx++] = g;
                rgbaData[dstIdx++] = a;
            }
        }

        return {
            width,
            height,
            data: rgbaData,
            colorType,
            bitDepth,
            chunks: parsedChunks
        };
    },

    /**
     * RGBA piksel dizisinden saf deterministik PNG dosyası üretir.
     * Hiçbir gereksiz tEXt veya ICC profili chunk'ı yazmaz; LSB bitlerini 100% korur.
     * @param {{ width: number, height: number, data: Uint8ClampedArray|Uint8Array }} image
     * @returns {Promise<Uint8Array>}
     */
    async encode({ width, height, data }) {
        if (!width || !height || !data || data.length < width * height * 4) {
            throw new Error("Geçersiz görsel parametreleri.");
        }

        // Satır başına Filter 0 (None) ekleyerek raw tarama satırlarını oluştur
        const rowLen = 1 + width * 4;
        const rawScanlines = new Uint8Array(height * rowLen);

        for (let y = 0; y < height; y++) {
            const rowOffset = y * rowLen;
            rawScanlines[rowOffset] = 0; // Filter 0: None
            const dataOffset = y * width * 4;
            rawScanlines.set(data.subarray(dataOffset, dataOffset + width * 4), rowOffset + 1);
        }

        // Streams API CompressionStream('deflate') ile zlib sıkıştırma
        const compressedIdat = await compressDeflate(rawScanlines);

        // Chunk yardımcı fonksiyonu
        function createChunk(typeStr, chunkData) {
            const len = chunkData.length;
            const chunkBuf = new Uint8Array(12 + len);
            const cView = new DataView(chunkBuf.buffer, chunkBuf.byteOffset, chunkBuf.byteLength);

            cView.setUint32(0, len, false);
            chunkBuf[4] = typeStr.charCodeAt(0);
            chunkBuf[5] = typeStr.charCodeAt(1);
            chunkBuf[6] = typeStr.charCodeAt(2);
            chunkBuf[7] = typeStr.charCodeAt(3);

            chunkBuf.set(chunkData, 8);
            const chunkCrc = crc32(chunkBuf, 4, len + 4);
            cView.setUint32(8 + len, chunkCrc, false);

            return chunkBuf;
        }

        // 1. IHDR Chunk (13 bayt)
        const ihdrData = new Uint8Array(13);
        const ihdrView = new DataView(ihdrData.buffer);
        ihdrView.setUint32(0, width, false);
        ihdrView.setUint32(4, height, false);
        ihdrData[8] = 8; // 8-bit
        ihdrData[9] = 6; // ColorType 6 (RGBA)
        ihdrData[10] = 0; // Deflate
        ihdrData[11] = 0; // Filter method 0
        ihdrData[12] = 0; // Interlace 0 (None)
        const ihdrChunk = createChunk('IHDR', ihdrData);

        // 2. IDAT Chunk
        const idatChunk = createChunk('IDAT', compressedIdat);

        // 3. IEND Chunk
        const iendChunk = createChunk('IEND', new Uint8Array(0));

        // Tüm PNG baytlarını birleştir
        const totalSize = 8 + ihdrChunk.length + idatChunk.length + iendChunk.length;
        const pngOutput = new Uint8Array(totalSize);

        pngOutput.set(PNG_SIGNATURE, 0);
        let writePos = 8;
        pngOutput.set(ihdrChunk, writePos); writePos += ihdrChunk.length;
        pngOutput.set(idatChunk, writePos); writePos += idatChunk.length;
        pngOutput.set(iendChunk, writePos);

        return pngOutput;
    }
};
