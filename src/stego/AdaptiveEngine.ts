/**
 * src/stego/AdaptiveEngine.ts
 * Dama Tahtası (Checkerboard) Çapa-Taşıyıcı Kafes Mimarisi ve İçerik Duyarlı Dağıtım Motoru.
 * - Alıcı ve verici arasında %100 deterministik senkronizasyon (& 0xFE üst-bit maskeleme).
 * - 2D Laplacian gradyan analizi ile yüksek varyanslı doku skorlama.
 * - Dinamik Stego Risk İndeksi ve doku aşım koruması.
 */

import { ScatterEngine } from './ScatterEngine.ts';
import { KeyDerivation } from '../crypto/KeyDerivation.ts';
import { CryptoEngine } from '../crypto/CryptoEngine.ts';
import { matchLsb1, matchLsb2 } from './MatchingEngine.ts';
import type { LsbMode, EmbedMethod, Partition, StegoRiskReport, SimpleImageData } from '../types/index.ts';

export const AdaptiveEngine = {
    /**
     * Dama tahtası kafesinde çapa piksellerini (anchor) kullanarak
     * iç taşıyıcı (payload) piksellerinin doku/kenar skorlarını hesaplar.
     */
    computeTextureScores(width: number, height: number, data: Uint8ClampedArray | Uint8Array): Float32Array {
        const scores = new Float32Array(width * height);
        for (let y = 1; y < height - 1; y++) {
            const rowOffset = y * width;
            for (let x = 1; x < width - 1; x++) {
                if ((x + y) % 2 !== 1) continue;

                let score = 0;
                const nIdx = ((y - 1) * width + x) * 4;
                const sIdx = ((y + 1) * width + x) * 4;
                const wIdx = (rowOffset + (x - 1)) * 4;
                const eIdx = (rowOffset + (x + 1)) * 4;

                for (let c = 0; c < 3; c++) {
                    const nVal = (data[nIdx + c] ?? 0) & 0xFE;
                    const sVal = (data[sIdx + c] ?? 0) & 0xFE;
                    const wVal = (data[wIdx + c] ?? 0) & 0xFE;
                    const eVal = (data[eIdx + c] ?? 0) & 0xFE;

                    score += Math.abs(nVal - sVal) + Math.abs(eVal - wVal);
                }
                scores[rowOffset + x] = score;
            }
        }
        return scores;
    },

    /**
     * Taşıyıcı pikselleri doku skorlarına göre azalan sırada sıralar.
     */
    getSortedPayloadPixels(width: number, height: number, data: Uint8ClampedArray | Uint8Array): Uint32Array {
        const scores = this.computeTextureScores(width, height, data);
        const list: { idx: number; score: number }[] = [];

        for (let y = 1; y < height - 1; y++) {
            const rowOffset = y * width;
            for (let x = 1; x < width - 1; x++) {
                if ((x + y) % 2 === 1) {
                    const idx = rowOffset + x;
                    list.push({ idx, score: scores[idx] ?? 0 });
                }
            }
        }

        list.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.idx - b.idx;
        });

        const sorted = new Uint32Array(list.length);
        for (let i = 0; i < list.length; i++) {
            sorted[i] = list[i]!.idx;
        }
        return sorted;
    },

    /**
     * Stego Risk İndeksini hesaplar.
     */
    calculateStegoRisk(
        payloadBytes: number,
        width: number,
        height: number,
        data: Uint8ClampedArray | Uint8Array,
        lsbMode: LsbMode = 1
    ): StegoRiskReport {
        const scores = this.computeTextureScores(width, height, data);
        let safePixelCount = 0;
        let totalPayloadPixels = 0;

        for (let y = 1; y < height - 1; y++) {
            const rowOffset = y * width;
            for (let x = 1; x < width - 1; x++) {
                if ((x + y) % 2 === 1) {
                    const s = scores[rowOffset + x] ?? 0;
                    totalPayloadPixels++;
                    if (s >= 12) safePixelCount++;
                }
            }
        }

        if (totalPayloadPixels < 256) {
            return {
                level: 'high',
                label: 'Yetersiz Görsel',
                badgeColor: 'var(--md-error)',
                usagePercent: 100,
                isTextureOverflow: true,
                safeTextureBytes: 0,
                totalPayloadBytes: payloadBytes,
                message: 'Görsel boyutu steganografik gömme için yetersiz (en az 256 taşıyıcı piksel gerekli).'
            };
        }

        const usableSafePixels = Math.max(0, safePixelCount - 256);
        const channelsPerByte = lsbMode === 2 ? 4 : 8;
        const safeTextureBytes = Math.floor((usableSafePixels * 3) / channelsPerByte);

        const ratio = payloadBytes / Math.max(1, safeTextureBytes);
        const usagePercent = Math.min(999, Math.round(ratio * 100));

        let level: 'low' | 'medium' | 'high' = 'low';
        let label = 'Düşük Risk';
        let badgeColor = 'var(--md-primary)';
        let message = 'Gizli veri tamamen yüksek varyanslı doku ve kenar bölgelerine sığıyor. İstatiksel tespit riski minimum seviyede.';

        if (usagePercent > 60) {
            level = 'high';
            label = 'Yüksek Tespit Riski';
            badgeColor = 'var(--md-error)';
            message = 'Gömülecek veri görselin yüksek dokulu alanlarını aşıp pürüzsüz/düz bölgelere (gökyüzü, homojen zemin) taşabilir. Tespit riski yüksektir.';
        } else if (usagePercent > 20) {
            level = 'medium';
            label = 'Orta Risk';
            badgeColor = '#ffd180';
            message = 'Veri yüksek ve orta dokulu alanlara yayılıyor. Doku karmaşıklığı steganaliz filtrelerini zorlaştırır.';
        }

        return {
            level,
            label,
            badgeColor,
            usagePercent,
            isTextureOverflow: usagePercent > 60,
            safeTextureBytes,
            totalPayloadBytes: payloadBytes,
            message
        };
    },

    /**
     * Format v3 İçerik Duyarlı Dağınık Gömme.
     */
    embedAdaptive(
        imageData: SimpleImageData,
        header48: Uint8Array,
        cipherBody: Uint8Array,
        lsbMode: LsbMode,
        scatterBits: ArrayBuffer,
        salt: Uint8Array | null = null,
        partition: Partition = 'all',
        method: EmbedMethod = 'matching',
        options: { strictSafeTexture?: boolean } = {}
    ): SimpleImageData {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        // 1. Genel Salt bloğunu satır 0'a yaz
        if (salt) {
            for (let b = 0; b < 16; b++) {
                for (let bit = 7; bit >= 0; bit--) {
                    const ch = b * 8 + (7 - bit);
                    const pixelIdx = Math.floor(ch / 3);
                    const rawIdx = pixelIdx * 4 + (ch % 3);
                    const bitVal = (salt[b]! >> bit) & 1;
                    if (method === 'matching') {
                        data[rawIdx] = matchLsb1(data[rawIdx]!, bitVal);
                    } else {
                        data[rawIdx] = (data[rawIdx]! & 0xFE) | bitVal;
                    }
                }
            }
        }

        // 2. Doku skorlarına göre sıralı taşıyıcı pikseller
        const sortedPixels = this.getSortedPayloadPixels(width, height, data);
        if (sortedPixels.length < 256) {
            throw new Error("Görsel içerik duyarlı gömme için çok küçük.");
        }

        // 3. Başlık Bölgesi: En yüksek dokulu ilk 256 piksel
        const headerPixels = sortedPixels.subarray(0, 256);
        const headerChannelsTotal = 256 * 3;
        const { c0: hc0, step: hstep } = ScatterEngine.deriveParamsFromBits(scatterBits, headerChannelsTotal, partition);

        let hStepIdx = 0;
        for (let b = 0; b < 48; b++) {
            for (let bit = 7; bit >= 0; bit--) {
                const bitVal = (header48[b]! >> bit) & 1;
                const ch = ScatterEngine.getPartitionChannel(hStepIdx++, headerChannelsTotal, hc0, hstep, partition);
                const px = headerPixels[Math.floor(ch / 3)]!;
                const c = ch % 3;
                const rawIdx = px * 4 + c;

                if (method === 'matching') {
                    data[rawIdx] = matchLsb1(data[rawIdx]!, bitVal);
                } else {
                    data[rawIdx] = (data[rawIdx]! & 0xFE) | bitVal;
                }
            }
        }

        // 4. Gövde Bölgesi
        const channelsPerByte = lsbMode === 2 ? 4 : 8;
        const neededBodyChannels = cipherBody.length * channelsPerByte;
        const neededBodyPixels = Math.ceil((partition === 'all' ? neededBodyChannels : neededBodyChannels * 2) / 3);

        const availableBodyPixels = sortedPixels.length - 256;
        if (neededBodyPixels > availableBodyPixels) {
            throw new Error(`Veri boyutu görselin dokulu alan kapasitesini aşıyor (${neededBodyPixels} piksel gerekli, ${availableBodyPixels} mevcut).`);
        }

        if (options.strictSafeTexture && neededBodyPixels > availableBodyPixels * 0.6) {
            throw new Error(`Doku Kapasitesi Aşımı: Veri boyutu yüksek dokulu güvenli bölgeleri aşıyor (${neededBodyPixels} piksel gerekli).`);
        }

        const bodyPixels = sortedPixels.subarray(256, 256 + neededBodyPixels);
        const bodyChannelsTotal = bodyPixels.length * 3;
        const { c0: bc0, step: bstep } = ScatterEngine.deriveParamsFromBits(scatterBits, bodyChannelsTotal, partition);

        let bStepIdx = 0;
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherBody.length; b++) {
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const bitsVal = (cipherBody[b]! >> bit) & mask;
                const ch = ScatterEngine.getPartitionChannel(bStepIdx++, bodyChannelsTotal, bc0, bstep, partition);
                const px = bodyPixels[Math.floor(ch / 3)]!;
                const c = ch % 3;
                const rawIdx = px * 4 + c;

                if (method === 'matching') {
                    if (lsbMode === 2) {
                        data[rawIdx] = matchLsb2(data[rawIdx]!, bitsVal);
                    } else {
                        data[rawIdx] = matchLsb1(data[rawIdx]!, bitsVal);
                    }
                } else {
                    data[rawIdx] = (data[rawIdx]! & ~mask) | bitsVal;
                }
            }
        }

        return imageData;
    },

    /**
     * Format v3 İçerik Duyarlı Dağınık Çıkarma.
     */
    async extractAdaptive(
        imageData: SimpleImageData,
        masterKey: CryptoKey,
        partition: Partition = 'all'
    ): Promise<Uint8Array> {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        const sortedPixels = this.getSortedPayloadPixels(width, height, data);
        if (sortedPixels.length < 256) {
            throw new Error("Görsel içerik duyarlı okuma için çok küçük.");
        }

        const label = `v3/${partition}` as const;
        const { scatterBits, metaKey, bodyKey } = await KeyDerivation.deriveSubkeysV3(masterKey, label);

        // 1. 48 baytlık başlığı topla
        const headerPixels = sortedPixels.subarray(0, 256);
        const headerChannelsTotal = 256 * 3;
        const { c0: hc0, step: hstep } = ScatterEngine.deriveParamsFromBits(scatterBits, headerChannelsTotal, partition);

        const header48 = new Uint8Array(48);
        let hStepIdx = 0;
        for (let b = 0; b < 48; b++) {
            let byteVal = 0;
            for (let bit = 7; bit >= 0; bit--) {
                const ch = ScatterEngine.getPartitionChannel(hStepIdx++, headerChannelsTotal, hc0, hstep, partition);
                const px = headerPixels[Math.floor(ch / 3)]!;
                const c = ch % 3;
                const rawIdx = px * 4 + c;
                byteVal = (byteVal << 1) | (data[rawIdx]! & 1);
            }
            header48[b] = byteVal;
        }

        // 2. Başlığı doğrula
        const { lsbMode, cipherLen, ivBody } = await CryptoEngine.decryptMetaV3(header48, metaKey as CryptoKey);

        const channelsPerByte = lsbMode === 2 ? 4 : 8;
        const neededBodyChannels = cipherLen * channelsPerByte;
        const neededBodyPixels = Math.ceil((partition === 'all' ? neededBodyChannels : neededBodyChannels * 2) / 3);

        const availableBodyPixels = sortedPixels.length - 256;
        if (neededBodyPixels > availableBodyPixels) {
            throw new Error("Görsel eksik veya kırpılmış.");
        }

        // 3. Gövdeyi topla
        const bodyPixels = sortedPixels.subarray(256, 256 + neededBodyPixels);
        const bodyChannelsTotal = bodyPixels.length * 3;
        const { c0: bc0, step: bstep } = ScatterEngine.deriveParamsFromBits(scatterBits, bodyChannelsTotal, partition);

        const cipherBody = new Uint8Array(cipherLen);
        let bStepIdx = 0;
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherLen; b++) {
            let byteVal = 0;
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const ch = ScatterEngine.getPartitionChannel(bStepIdx++, bodyChannelsTotal, bc0, bstep, partition);
                const px = bodyPixels[Math.floor(ch / 3)]!;
                const c = ch % 3;
                const rawIdx = px * 4 + c;
                const bitsVal = data[rawIdx]! & mask;
                byteVal = (byteVal << lsbMode) | bitsVal;
            }
            cipherBody[b] = byteVal;
        }

        // 4. Gövdeyi çöz
        return await CryptoEngine.decryptBodyV3(cipherBody, bodyKey as CryptoKey, ivBody);
    }
};
