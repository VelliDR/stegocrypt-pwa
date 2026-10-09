/**
 * js/BinaryInspector.js
 * Faz 5: İkili Yapı (Binary Structure) ve Dosya Triyaj Motoru (Stego-Workbench)
 * - Canvas kullanmadan doğrudan ArrayBuffer ve DataView ile çalışır.
 * - PNG Chunk listesi çıkarma, CRC-32 doğrulama, IHDR/tEXt/iTXt/zTXt analizi.
 * - IEND / EOI sonrası ek veri (Trailing Data / Overlay Injection) tespiti ve imza analizi (ZIP, PDF, 7z, vb.).
 * - JPEG Marker taraması (EXIF/APP1, COM, SOF boyutları, EOI sonrası veri).
 */

import { crc32 } from './png/PngCodec.js';

// Bilinen dosya ve ek veri imzaları
const KNOWN_SIGNATURES = [
    { name: 'ZIP Arşivi (Local File Header)', bytes: [0x50, 0x4B, 0x03, 0x04], ext: 'zip' },
    { name: 'ZIP Arşivi (Empty / Central Dir)', bytes: [0x50, 0x4B, 0x05, 0x06], ext: 'zip' },
    { name: 'PDF Belgesi (%PDF-)', bytes: [0x25, 0x50, 0x44, 0x46], ext: 'pdf' },
    { name: '7-Zip Arşivi (7z)', bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C], ext: '7z' },
    { name: 'RAR Arşivi (Rar!)', bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07], ext: 'rar' },
    { name: 'PNG Görseli (\x89PNG)', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], ext: 'png' },
    { name: 'JPEG Görseli (\xFF\xD8\xFF)', bytes: [0xFF, 0xD8, 0xFF], ext: 'jpg' },
    { name: 'GZIP Sıkıştırılmış Veri', bytes: [0x1F, 0x8B], ext: 'gz' },
    { name: 'BZIP2 Sıkıştırılmış Veri', bytes: [0x42, 0x5A, 0x68], ext: 'bz2' },
    { name: 'XZ Sıkıştırılmış Veri', bytes: [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00], ext: 'xz' },
    { name: 'Windows/DOS Çalıştırılabilir (MZ)', bytes: [0x4D, 0x5A], ext: 'exe' },
    { name: 'ELF Çalıştırılabilir (Linux)', bytes: [0x7F, 0x45, 0x4C, 0x46], ext: 'bin' }
];

export const BinaryInspector = {
    /**
     * Dosya tipini imzasına (magic bytes) göre belirler.
     * @param {ArrayBuffer|Uint8Array} buffer
     * @returns {'png'|'jpeg'|'webp'|'gif'|'unknown'}
     */
    detectFileType(buffer) {
        const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        if (u8.length >= 8 &&
            u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47 &&
            u8[4] === 0x0D && u8[5] === 0x0A && u8[6] === 0x1A && u8[7] === 0x0A) {
            return 'png';
        }
        if (u8.length >= 3 && u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) {
            return 'jpeg';
        }
        if (u8.length >= 12 &&
            u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
            u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) {
            return 'webp';
        }
        if (u8.length >= 6 &&
            u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 &&
            u8[3] === 0x38 && (u8[4] === 0x37 || u8[4] === 0x39) && u8[5] === 0x61) {
            return 'gif';
        }
        return 'unknown';
    },

    /**
     * Bayt dizisi içindeki bilinen dosya imzasını arar.
     * @param {Uint8Array} data
     * @returns {{ name: string, ext: string }|null}
     */
    identifySignature(data) {
        for (const sig of KNOWN_SIGNATURES) {
            if (data.length >= sig.bytes.length) {
                let match = true;
                for (let i = 0; i < sig.bytes.length; i++) {
                    if (data[i] !== sig.bytes[i]) {
                        match = false;
                        break;
                    }
                }
                if (match) return { name: sig.name, ext: sig.ext };
            }
        }
        return null;
    },

    /**
     * Bayt dizisinin hex görünümünü döndürür.
     * @param {Uint8Array} data
     * @param {number} maxBytes
     * @returns {string}
     */
    toHexPreview(data, maxBytes = 32) {
        const count = Math.min(data.length, maxBytes);
        const hex = [];
        for (let i = 0; i < count; i++) {
            hex.push(data[i].toString(16).padStart(2, '0').toUpperCase());
        }
        return hex.join(' ') + (data.length > maxBytes ? ' ...' : '');
    },

    /**
     * PNG Dosya Yapısını ve Chunk'larını derinlemesine inceler.
     * @param {ArrayBuffer|Uint8Array} buffer
     * @returns {object}
     */
    inspectPng(buffer) {
        const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

        if (this.detectFileType(u8) !== 'png') {
            throw new Error("Geçersiz PNG dosya imzası (Magic header uyuşmuyor).");
        }

        const chunks = [];
        let offset = 8;
        let iendEndOffset = -1;
        let hasCrcError = false;
        let ihdrInfo = null;
        const textEntries = [];

        while (offset + 8 <= u8.length) {
            const length = view.getUint32(offset, false);
            const typeBytes = u8.subarray(offset + 4, offset + 8);
            const type = String.fromCharCode(...typeBytes);

            const dataOffset = offset + 8;
            const crcOffset = dataOffset + length;

            if (crcOffset + 4 > u8.length) {
                // Chunk dosya sonunu aşıyor (kesilmiş dosya)
                chunks.push({
                    type,
                    offset,
                    length,
                    crcValid: false,
                    isCorrupted: true,
                    description: "Bozuk / Kesilmiş Chunk (Dosya sınırı aşıldı)"
                });
                break;
            }

            const expectedCrc = view.getUint32(crcOffset, false);
            // CRC type ve data baytları üzerinden hesaplanır
            const actualCrc = crc32(u8, offset + 4, 4 + length);
            const crcValid = expectedCrc === actualCrc;
            if (!crcValid) hasCrcError = true;

            const isCritical = (typeBytes[0] & 0x20) === 0;
            const isPublic = (typeBytes[1] & 0x20) === 0;

            const chunkData = u8.subarray(dataOffset, dataOffset + length);
            let detail = '';

            // IHDR Bilgisi
            if (type === 'IHDR' && length >= 13) {
                const width = view.getUint32(dataOffset, false);
                const height = view.getUint32(dataOffset + 4, false);
                const bitDepth = u8[dataOffset + 8];
                const colorType = u8[dataOffset + 9];
                const comp = u8[dataOffset + 10];
                const filter = u8[dataOffset + 11];
                const interlace = u8[dataOffset + 12];

                const colorTypeNames = {
                    0: 'Grayscale',
                    2: 'RGB',
                    3: 'Palette (Indexed)',
                    4: 'Grayscale + Alpha',
                    6: 'RGBA'
                };

                ihdrInfo = {
                    width,
                    height,
                    bitDepth,
                    colorType,
                    colorTypeName: colorTypeNames[colorType] || `Bilinmeyen (${colorType})`,
                    interlace: interlace === 1 ? 'Adam7 (Interlaced)' : 'None (Non-interlaced)'
                };
                detail = `${width}x${height}, ${bitDepth}-bit ${ihdrInfo.colorTypeName}`;
            }

            // Metin Chunk'ları (tEXt, zTXt, iTXt)
            if (type === 'tEXt' && length > 0) {
                let nullIdx = -1;
                for (let i = 0; i < length; i++) {
                    if (chunkData[i] === 0) { nullIdx = i; break; }
                }
                if (nullIdx !== -1) {
                    const key = new TextDecoder('latin1').decode(chunkData.subarray(0, nullIdx));
                    const val = new TextDecoder('latin1').decode(chunkData.subarray(nullIdx + 1));
                    textEntries.push({ key, val, type: 'tEXt' });
                    detail = `${key}: ${val.slice(0, 40)}${val.length > 40 ? '...' : ''}`;
                }
            } else if (type === 'iTXt' && length > 0) {
                let nullIdx = -1;
                for (let i = 0; i < length; i++) {
                    if (chunkData[i] === 0) { nullIdx = i; break; }
                }
                if (nullIdx !== -1) {
                    const key = new TextDecoder('utf-8').decode(chunkData.subarray(0, nullIdx));
                    textEntries.push({ key, val: "[iTXt UTF-8 Metin]", type: 'iTXt' });
                    detail = `Anahtar: ${key}`;
                }
            } else if (type === 'zTXt') {
                textEntries.push({ key: "zTXt", val: "[Sıkıştırılmış Metin]", type: 'zTXt' });
                detail = "Sıkıştırılmış metin bloğu";
            }

            chunks.push({
                type,
                offset,
                length,
                expectedCrc,
                actualCrc,
                crcValid,
                isCritical,
                isPublic,
                detail
            });

            const nextOffset = crcOffset + 4;
            if (type === 'IEND') {
                iendEndOffset = nextOffset;
                offset = nextOffset;
                break;
            }
            offset = nextOffset;
        }

        // IEND Sonrası Ekstra Veri (Overlay / Trailing Injection) Kontrolü
        let trailingData = null;
        if (iendEndOffset !== -1 && iendEndOffset < u8.length) {
            const trailingBytes = u8.slice(iendEndOffset);
            const signature = this.identifySignature(trailingBytes);
            trailingData = {
                offset: iendEndOffset,
                length: trailingBytes.length,
                hexPreview: this.toHexPreview(trailingBytes),
                identifiedSignature: signature ? signature.name : 'Bilinmeyen İkili Veri',
                possibleExtension: signature ? signature.ext : 'bin',
                bytes: trailingBytes
            };
        }

        // Durum Değerlendirmesi (Verdict)
        let verdict = "Temiz PNG Yapısı";
        let verdictLevel = "clean";
        let verdictDetails = "Tüm chunk'lar standartlara uygun ve CRC-32 doğrulaması başarılı.";

        if (trailingData) {
            verdict = "⚠️ IEND Sonrası Gizli Veri Tespit Edildi (Overlay Injection)";
            verdictLevel = "alert";
            verdictDetails = `PNG IEND sonlandırıcı chunk'ından sonra ${trailingData.length} bayt ek veri bulundu! İmza: ${trailingData.identifiedSignature}. Bu yöntem genellikle dosya arkasına ZIP/PDF saklamak için kullanılır.`;
        } else if (hasCrcError) {
            verdict = "⚠️ Chunk CRC Hatası Tespit Edildi";
            verdictLevel = "warning";
            verdictDetails = "Bir veya daha fazla PNG chunk'ında CRC-32 sağlama toplamı tutarsız. Dosya tahrif edilmiş veya bozulmuş olabilir.";
        }

        return {
            format: 'png',
            fileSize: u8.length,
            chunks,
            chunkCount: chunks.length,
            ihdrInfo,
            textEntries,
            trailingData,
            verdict,
            verdictLevel,
            verdictDetails
        };
    },

    /**
     * JPEG Dosya Yapısını ve Marker'larını inceler.
     * @param {ArrayBuffer|Uint8Array} buffer
     * @returns {object}
     */
    inspectJpeg(buffer) {
        const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

        if (this.detectFileType(u8) !== 'jpeg') {
            throw new Error("Geçersiz JPEG dosya imzası.");
        }

        const markers = [];
        let offset = 2; // 0xFF, 0xD8 atlandı
        let eoiEndOffset = -1;
        let hasExif = false;
        let dimensions = null;

        while (offset + 1 < u8.length) {
            if (u8[offset] !== 0xFF) {
                offset++;
                continue;
            }

            const markerCode = u8[offset + 1];
            // Dolgu 0xFF baytlarını atla
            if (markerCode === 0xFF || markerCode === 0x00) {
                offset++;
                continue;
            }

            const markerOffset = offset;
            offset += 2;

            // Standalone marker'lar (Boyutsuz)
            if (markerCode === 0xD9) { // EOI (End of Image)
                markers.push({ code: 'FFD9', name: 'EOI (End of Image)', offset: markerOffset, length: 0 });
                eoiEndOffset = offset;
                break;
            }
            if (markerCode === 0xD8) { // SOI
                markers.push({ code: 'FFD8', name: 'SOI (Start of Image)', offset: markerOffset, length: 0 });
                continue;
            }
            if (markerCode >= 0xD0 && markerCode <= 0xD7) { // RST
                markers.push({ code: `FF${markerCode.toString(16).toUpperCase()}`, name: `RST${markerCode - 0xD0}`, offset: markerOffset, length: 0 });
                continue;
            }

            // Boyutlu marker'lar
            if (offset + 2 > u8.length) break;
            const length = view.getUint32(offset - 2, false) & 0xFFFF; // 2-byte length
            const markerLen = (u8[offset] << 8) | u8[offset + 1];

            let name = `Marker FF${markerCode.toString(16).toUpperCase()}`;
            if (markerCode === 0xE1) {
                name = 'APP1 (EXIF / XMP Metaverisi)';
                hasExif = true;
            } else if (markerCode === 0xE0) {
                name = 'APP0 (JFIF Başlığı)';
            } else if (markerCode === 0xDB) {
                name = 'DQT (Kuantalama Tablosu)';
            } else if (markerCode === 0xC0) {
                name = 'SOF0 (Baseline DCT Boyutları)';
                if (offset + 2 + 5 <= u8.length) {
                    const h = (u8[offset + 3] << 8) | u8[offset + 4];
                    const w = (u8[offset + 5] << 8) | u8[offset + 6];
                    dimensions = { width: w, height: h };
                }
            } else if (markerCode === 0xC2) {
                name = 'SOF2 (Progressive DCT Boyutları)';
                if (offset + 2 + 5 <= u8.length) {
                    const h = (u8[offset + 3] << 8) | u8[offset + 4];
                    const w = (u8[offset + 5] << 8) | u8[offset + 6];
                    dimensions = { width: w, height: h };
                }
            } else if (markerCode === 0xC4) {
                name = 'DHT (Huffman Tablosu)';
            } else if (markerCode === 0xDA) {
                name = 'SOS (Start of Scan - Sıkıştırılmış Veri)';
            } else if (markerCode === 0xFE) {
                name = 'COM (JPEG Yorum Satırı)';
            }

            markers.push({
                code: `FF${markerCode.toString(16).toUpperCase()}`,
                name,
                offset: markerOffset,
                length: markerLen
            });

            // SOS marker'dan sonra sıkıştırılmış görüntü verisi gelir, EOI'ye kadar tarar
            if (markerCode === 0xDA) {
                offset += markerLen;
                // EOI (FF D9) ara
                while (offset + 1 < u8.length) {
                    if (u8[offset] === 0xFF && u8[offset + 1] === 0xD9) {
                        markers.push({ code: 'FFD9', name: 'EOI (End of Image)', offset, length: 0 });
                        eoiEndOffset = offset + 2;
                        offset += 2;
                        break;
                    }
                    offset++;
                }
                break;
            }

            offset += markerLen;
        }

        // EOI Sonrası Ekstra Veri Kontrolü
        let trailingData = null;
        if (eoiEndOffset !== -1 && eoiEndOffset < u8.length) {
            const trailingBytes = u8.slice(eoiEndOffset);
            const signature = this.identifySignature(trailingBytes);
            trailingData = {
                offset: eoiEndOffset,
                length: trailingBytes.length,
                hexPreview: this.toHexPreview(trailingBytes),
                identifiedSignature: signature ? signature.name : 'Bilinmeyen İkili Veri',
                possibleExtension: signature ? signature.ext : 'bin',
                bytes: trailingBytes
            };
        }

        let verdict = "Standart JPEG Yapısı";
        let verdictLevel = "clean";
        let verdictDetails = "JPEG marker dizisi kurallara uygun tamamlandı.";

        if (trailingData) {
            verdict = "⚠️ EOI Sonrası Gizli Veri Tespit Edildi (JPEG Overlay)";
            verdictLevel = "alert";
            verdictDetails = `JPEG sonlandırıcı marker'ından (FF D9) sonra ${trailingData.length} bayt ek veri bulundu! İmza: ${trailingData.identifiedSignature}.`;
        }

        return {
            format: 'jpeg',
            fileSize: u8.length,
            markers,
            markerCount: markers.length,
            dimensions,
            hasExif,
            trailingData,
            verdict,
            verdictLevel,
            verdictDetails
        };
    },

    /**
     * Genel dosya denetimi: Dosya tipini algılar ve uygun ayrıştırıcıyı çağırır.
     * @param {ArrayBuffer|Uint8Array} buffer
     * @returns {object}
     */
    inspect(buffer) {
        const fileType = this.detectFileType(buffer);
        if (fileType === 'png') {
            return this.inspectPng(buffer);
        }
        if (fileType === 'jpeg') {
            return this.inspectJpeg(buffer);
        }
        return {
            format: fileType,
            fileSize: buffer.byteLength || buffer.length,
            verdict: "Format İncelemesi Sınırlı",
            verdictLevel: "clean",
            verdictDetails: `Bu dosya formatı (${fileType.toUpperCase()}) için derin chunk incelemesi desteklenmiyor; genel bayt boyutu doğrulandı.`
        };
    }
};
