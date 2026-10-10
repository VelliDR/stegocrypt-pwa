/**
 * src/forensics/BinaryInspector.ts
 * İkili Yapı (Binary Structure) ve Dosya Triyaj Motoru.
 * - Doğrudan ArrayBuffer ve DataView ile çalışır.
 * - PNG Chunk listesi çıkarma, CRC-32 doğrulama, IEND sonrası ek veri (Trailing Data / Overlay Injection) tespiti.
 * - JPEG Marker taraması (EXIF/APP1, COM, SOF boyutları, EOI sonrası veri).
 */

import { crc32 } from '../codec/PngCodec.ts';
import type { BinaryInspectionReport, PngChunkInfo, TrailingDataReport } from '../types/index.ts';

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
    detectFileType(buffer: ArrayBuffer | Uint8Array): 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown' {
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

    identifySignature(data: Uint8Array): { name: string; ext: string } | null {
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

    toHexPreview(data: Uint8Array, maxBytes: number = 32): string {
        const count = Math.min(data.length, maxBytes);
        const hex: string[] = [];
        for (let i = 0; i < count; i++) {
            hex.push(data[i]!.toString(16).padStart(2, '0').toUpperCase());
        }
        return hex.join(' ') + (data.length > maxBytes ? ' ...' : '');
    },

    inspectPng(buffer: ArrayBuffer | Uint8Array): BinaryInspectionReport {
        const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

        if (this.detectFileType(u8) !== 'png') {
            throw new Error("Geçersiz PNG dosya imzası.");
        }

        const chunks: PngChunkInfo[] = [];
        const textEntries: { keyword: string; text: string }[] = [];
        let ihdrInfo: BinaryInspectionReport['ihdrInfo'] | undefined;
        let offset = 8;
        let chunkIndex = 0;
        let iendEndOffset = -1;

        while (offset + 8 <= u8.length) {
            const length = view.getUint32(offset, false);
            const type = new TextDecoder().decode(u8.subarray(offset + 4, offset + 8));
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;

            if (dataEnd + 4 > u8.length) {
                break;
            }

            const expectedCrc = view.getUint32(dataEnd, false);
            const calculatedCrc = crc32(u8.subarray(offset + 4, dataEnd));
            const crcValid = expectedCrc === calculatedCrc;

            let description = "Standart Chunk";
            if (type === 'IHDR') {
                const w = view.getUint32(dataStart, false);
                const h = view.getUint32(dataStart + 4, false);
                const bitDepth = u8[dataStart + 8]!;
                const colorType = u8[dataStart + 9]!;
                const colorTypeName = colorType === 6 ? 'RGBA' : colorType === 2 ? 'RGB' : colorType === 0 ? 'Grayscale' : colorType === 3 ? 'Indexed' : 'Bilinmeyen';
                ihdrInfo = { width: w, height: h, bitDepth, colorType, colorTypeName };
                description = `Görsel Başlığı: ${w}×${h}, ${colorTypeName}, ${bitDepth}-bit`;
            } else if (type === 'IDAT') {
                description = `Görüntü Verisi (${length} bayt)`;
            } else if (type === 'IEND') {
                description = "Görsel Sonu (Sonlandırıcı)";
                iendEndOffset = dataEnd + 4;
            } else if (type === 'tEXt') {
                description = "Düz Metin Metaveri";
                const textBytes = u8.subarray(dataStart, dataEnd);
                const nullIdx = textBytes.indexOf(0);
                if (nullIdx !== -1) {
                    const kw = new TextDecoder().decode(textBytes.subarray(0, nullIdx));
                    const val = new TextDecoder().decode(textBytes.subarray(nullIdx + 1));
                    textEntries.push({ keyword: kw, text: val });
                }
            }

            chunks.push({
                index: chunkIndex++,
                type,
                length,
                offset,
                crcValid,
                isCritical: type[0] === type[0]?.toUpperCase(),
                description
            });

            offset = dataEnd + 4;
            if (type === 'IEND') break;
        }

        let trailingData: TrailingDataReport | null = null;
        if (iendEndOffset !== -1 && iendEndOffset < u8.length) {
            const trailingBytes = u8.subarray(iendEndOffset);
            const sig = this.identifySignature(trailingBytes);
            trailingData = {
                offset: iendEndOffset,
                length: trailingBytes.length,
                hexPreview: this.toHexPreview(trailingBytes),
                identifiedSignature: sig ? sig.name : 'Bilinmeyen İkili Veri',
                possibleExtension: sig ? sig.ext : 'bin',
                bytes: trailingBytes
            };
        }

        let verdict = "Standart ve Temiz PNG Yapısı";
        let verdictLevel: 'clean' | 'alert' = 'clean';
        let verdictDetails = "Tüm chunk'lar kurallara uygun ve CRC doğrulamalarından başarıyla geçti.";

        if (trailingData) {
            verdict = "⚠️ IEND Sonrası Gizli Veri Tespit Edildi (Trailing Overlay)";
            verdictLevel = 'alert';
            verdictDetails = `PNG sonlandırıcı chunk'ından (IEND) sonra ${trailingData.length} bayt ek veri bulundu! İmza: ${trailingData.identifiedSignature}.`;
        } else if (chunks.some(c => !c.crcValid)) {
            verdict = "⚠️ Bozuk veya Tahrif Edilmiş Chunk (CRC Uyuşmazlığı)";
            verdictLevel = 'alert';
            verdictDetails = "Bir veya daha fazla PNG chunk'ında CRC-32 sağlama toplamı tutarsız. Dosya tahrif edilmiş olabilir.";
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

    inspectJpeg(buffer: ArrayBuffer | Uint8Array): BinaryInspectionReport {
        const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

        if (this.detectFileType(u8) !== 'jpeg') {
            throw new Error("Geçersiz JPEG dosya imzası.");
        }

        let offset = 2;
        let eoiEndOffset = -1;

        while (offset + 1 < u8.length) {
            if (u8[offset] !== 0xFF) {
                offset++;
                continue;
            }

            const markerCode = u8[offset + 1]!;
            if (markerCode === 0xFF || markerCode === 0x00) {
                offset++;
                continue;
            }

            offset += 2;
            if (markerCode === 0xD9) { // EOI
                eoiEndOffset = offset;
                break;
            }
            if (markerCode === 0xD8) continue;
            if (markerCode >= 0xD0 && markerCode <= 0xD7) continue;

            if (offset + 2 > u8.length) break;
            const markerLen = (u8[offset]! << 8) | u8[offset + 1]!;

            if (markerCode === 0xDA) { // SOS
                offset += markerLen;
                while (offset + 1 < u8.length) {
                    if (u8[offset] === 0xFF && u8[offset + 1] === 0xD9) {
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

        let trailingData: TrailingDataReport | null = null;
        if (eoiEndOffset !== -1 && eoiEndOffset < u8.length) {
            const trailingBytes = u8.subarray(eoiEndOffset);
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
        let verdictLevel: 'clean' | 'alert' = 'clean';
        let verdictDetails = "JPEG marker dizisi standart. Not: JPEG kayıplı DCT kullandığından mekânsal LSB steganografisini koruyamaz; ancak EOI overlay veya EXIF enjeksiyonu içerebilir.";

        if (trailingData) {
            verdict = "⚠️ EOI Sonrası Gizli Veri Tespit Edildi (JPEG Overlay)";
            verdictLevel = 'alert';
            verdictDetails = `JPEG sonlandırıcı marker'ından (FF D9) sonra ${trailingData.length} bayt ek veri bulundu! İmza: ${trailingData.identifiedSignature}.`;
        }

        return {
            format: 'jpeg',
            fileSize: u8.length,
            trailingData,
            verdict,
            verdictLevel,
            verdictDetails
        };
    },

    inspect(buffer: ArrayBuffer | Uint8Array): BinaryInspectionReport {
        const fileType = this.detectFileType(buffer);
        if (fileType === 'png') return this.inspectPng(buffer);
        if (fileType === 'jpeg') return this.inspectJpeg(buffer);

        return {
            format: fileType,
            fileSize: buffer.byteLength,
            trailingData: null,
            verdict: "Format İncelemesi Sınırlı",
            verdictLevel: 'clean',
            verdictDetails: `Bu dosya formatı (${fileType.toUpperCase()}) için derin chunk incelemesi desteklenmiyor; genel bayt boyutu doğrulandı.`
        };
    }
};
