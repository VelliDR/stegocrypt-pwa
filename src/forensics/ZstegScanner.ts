/**
 * src/forensics/ZstegScanner.ts
 * 56-Kombinasyonlu Kartezyen zsteg Derin Tarama Motoru.
 * - Kanallar (7): r, g, b, rgb, bgr, rgba, abgr
 * - Bit Derinliği (2): 1b, 2b
 * - Bit Sırası (2): lsb, msb
 * - Piksel Yönü (2): xy (satır öncelikli), yx (sütun öncelikli)
 * - 7 × 2 × 2 × 2 = 56 Kombinasyon.
 */

import type { ZstegFinding, SimpleImageData } from '../types/index.ts';

export interface ZstegCombination {
    id: string;
    channel: 'r' | 'g' | 'b' | 'rgb' | 'bgr' | 'rgba' | 'abgr';
    depth: 1 | 2;
    order: 'lsb' | 'msb';
    dir: 'xy' | 'yx';
}

const MAGIC_SIGNATURES = [
    { name: 'PNG Görseli', bytes: [0x89, 0x50, 0x4E, 0x47] },
    { name: 'JPEG Görseli', bytes: [0xFF, 0xD8, 0xFF] },
    { name: 'GIF Görseli', bytes: [0x47, 0x49, 0x46, 0x38] },
    { name: 'ZIP / DOCX / APK', bytes: [0x50, 0x4B, 0x03, 0x04] },
    { name: 'ELF Çalıştırılabilir', bytes: [0x7F, 0x45, 0x4C, 0x46] },
    { name: 'PDF Belgesi', bytes: [0x25, 0x50, 0x44, 0x46] },
    { name: 'StegoCrypt Format v1', bytes: [0x53, 0x54, 0x47, 0x31] },
    { name: 'StegoCrypt Format v2', bytes: [0x53, 0x54, 0x47, 0x32] }
];

const FLAG_REGEX = /(flag\{[^}]+\}|ctf\{[^}]+\}|stego\{[^}]+\}|key\{[^}]+\})/i;

export const ZstegScanner = {
    getCombinations(): ZstegCombination[] {
        const channels: ZstegCombination['channel'][] = ['r', 'g', 'b', 'rgb', 'bgr', 'rgba', 'abgr'];
        const depths: (1 | 2)[] = [1, 2];
        const orders: ('lsb' | 'msb')[] = ['lsb', 'msb'];
        const dirs: ('xy' | 'yx')[] = ['xy', 'yx'];

        const list: ZstegCombination[] = [];
        for (const channel of channels) {
            for (const depth of depths) {
                for (const order of orders) {
                    for (const dir of dirs) {
                        const id = `${channel},${depth}b,${order},${dir}`;
                        list.push({ id, channel, depth, order, dir });
                    }
                }
            }
        }
        return list;
    },

    extractBytes(imageData: SimpleImageData, combo: ZstegCombination, maxBytes: number = 2048): Uint8Array {
        const { width, height, data } = imageData;
        const channelMap: Record<ZstegCombination['channel'], number[]> = {
            r: [0],
            g: [1],
            b: [2],
            rgb: [0, 1, 2],
            bgr: [2, 1, 0],
            rgba: [0, 1, 2, 3],
            abgr: [3, 2, 1, 0]
        };
        const offsets = channelMap[combo.channel];
        const depth = combo.depth;
        const mask = (1 << depth) - 1;
        const isMsb = combo.order === 'msb';
        const isYx = combo.dir === 'yx';

        const out = new Uint8Array(maxBytes);
        let byteIdx = 0;
        let curByte = 0;
        let bitCount = 0;

        const outerLimit = isYx ? width : height;
        const innerLimit = isYx ? height : width;

        for (let o = 0; o < outerLimit; o++) {
            for (let i = 0; i < innerLimit; i++) {
                const x = isYx ? o : i;
                const y = isYx ? i : o;
                const pIdx = (y * width + x) * 4;

                for (let c = 0; c < offsets.length; c++) {
                    const rawVal = data[pIdx + offsets[c]!]!;
                    let bits = rawVal & mask;

                    if (isMsb && depth === 2) {
                        bits = ((bits & 1) << 1) | ((bits >> 1) & 1);
                    }

                    if (depth === 1) {
                        curByte = (curByte << 1) | (bits & 1);
                        bitCount++;
                        if (bitCount === 8) {
                            out[byteIdx++] = curByte;
                            curByte = 0;
                            bitCount = 0;
                            if (byteIdx >= maxBytes) return out;
                        }
                    } else if (depth === 2) {
                        curByte = (curByte << 2) | (bits & 3);
                        bitCount += 2;
                        if (bitCount === 8) {
                            out[byteIdx++] = curByte;
                            curByte = 0;
                            bitCount = 0;
                            if (byteIdx >= maxBytes) return out;
                        }
                    }
                }
            }
        }

        return out.subarray(0, byteIdx);
    },

    inspectSample(sample: Uint8Array): { signatureName: string; textSample: string; confidence: 'high' | 'medium' | 'low' } | null {
        if (sample.length < 8) return null;

        // 1. Bilinen Sihirli Başlık Kontrolü
        for (const sig of MAGIC_SIGNATURES) {
            let match = true;
            for (let i = 0; i < sig.bytes.length; i++) {
                if (sample[i] !== sig.bytes[i]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return {
                    signatureName: sig.name,
                    textSample: `Başlık: ${sig.name} (Hex: ${Array.from(sample.subarray(0, 8)).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')})`,
                    confidence: 'high'
                };
            }
        }

        // 2. Açık Metin ve Regex Taraması
        let text = '';
        for (let i = 0; i < Math.min(sample.length, 512); i++) {
            const b = sample[i]!;
            text += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '·';
        }

        const flagMatch = text.match(FLAG_REGEX);
        if (flagMatch) {
            return {
                signatureName: '🚩 CTF Bayrağı / Gizli Anahtar',
                textSample: flagMatch[0],
                confidence: 'high'
            };
        }

        // 3. Yazdırılabilir ASCII Yoğunluk Oranı
        let printable = 0;
        for (let i = 0; i < Math.min(sample.length, 256); i++) {
            const b = sample[i]!;
            if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) printable++;
        }
        const printableRatio = printable / Math.min(sample.length, 256);

        if (printableRatio > 0.85) {
            const cleanText = text.replace(/·+/g, ' ').trim().slice(0, 80);
            return {
                signatureName: 'Açık ASCII Metni',
                textSample: cleanText,
                confidence: printableRatio > 0.95 ? 'high' : 'medium'
            };
        }

        return null;
    },

    scan(
        imageData: SimpleImageData,
        options: {
            maxSampleBytes?: number;
            onProgress?: (percent: number, comboId: string, foundCount: number) => void;
        } = {}
    ): ZstegFinding[] {
        const maxSampleBytes = options.maxSampleBytes ?? 2048;
        const combos = this.getCombinations();
        const findings: ZstegFinding[] = [];

        for (let i = 0; i < combos.length; i++) {
            const combo = combos[i]!;
            const sample = this.extractBytes(imageData, combo, maxSampleBytes);
            const inspected = this.inspectSample(sample);

            if (inspected) {
                findings.push({
                    comboId: combo.id,
                    offset: 0,
                    signatureName: inspected.signatureName,
                    textSample: inspected.textSample,
                    confidence: inspected.confidence
                });
            }

            if (options.onProgress) {
                const percent = Math.round(((i + 1) / combos.length) * 100);
                options.onProgress(percent, combo.id, findings.length);
            }
        }

        return findings;
    },

    extractPayload(imageData: SimpleImageData, comboId: string, maxBytes: number = 1048576): Uint8Array {
        const combos = this.getCombinations();
        const target = combos.find(c => c.id === comboId);
        if (!target) throw new Error(`Bilinmeyen kombinasyon: ${comboId}`);
        return this.extractBytes(imageData, target, maxBytes);
    }
};
