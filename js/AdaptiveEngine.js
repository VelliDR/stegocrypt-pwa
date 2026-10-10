/**
 * js/AdaptiveEngine.js
 * Faz 4: Üst-Bit Maskeli İçerik Duyarlı (Content-Adaptive) Dağıtım Motoru
 * - Dama Tahtası (Checkerboard) Çapa-Taşıyıcı Kafes Mimarisi
 * - Alıcı-Verici 100% Deterministik Senkronizasyon (Bit-Exact Invariance)
 * - 2D Laplacian Doku / Varyans Skorlama
 * - Dinamik Göreli Stego Risk İndeksi (Stego Risk Index)
 */
import { ScatterEngine } from './ScatterEngine.js';
import { CryptoEngine } from './CryptoEngine.js';
import { matchLsb1, matchLsb2 } from './StegoEngine.js';

export const AdaptiveEngine = {
    /**
     * Dama tahtası kafesinde çapa piksellerini (anchor) kullanarak
     * iç taşıyıcı (payload) piksellerinin doku/kenar skorlarını hesaplar.
     * Çapa pikselleri asla değiştirilmediğinden ve & 0xFE maskeli okunduğundan
     * gönderici ve alıcı skorları %100 bit-exact olarak aynı üretir.
     * 
     * @param {number} width
     * @param {number} height
     * @param {Uint8ClampedArray|Uint8Array} data
     * @returns {Float32Array}
     */
    computeTextureScores(width, height, data) {
        const scores = new Float32Array(width * height);
        // Kenar sınır piksellerini hariç tut (y: 1..height-2, x: 1..width-2)
        for (let y = 1; y < height - 1; y++) {
            const rowOffset = y * width;
            for (let x = 1; x < width - 1; x++) {
                // Taşıyıcı piksel kuralı: (x + y) mod 2 === 1
                if ((x + y) % 2 !== 1) continue;

                let score = 0;
                // 4 ortogonal komşu (Kuzey, Güney, Batı, Doğu) daima ÇAPA pikseldir ((x+y) mod 2 === 0)
                const nIdx = ((y - 1) * width + x) * 4;
                const sIdx = ((y + 1) * width + x) * 4;
                const wIdx = (rowOffset + (x - 1)) * 4;
                const eIdx = (rowOffset + (x + 1)) * 4;

                for (let c = 0; c < 3; c++) {
                    // Üst-bit maskeleme (& 0xFE) ile salt ve LSB değişimlerine karşı mutlak değişmezlik
                    const nVal = data[nIdx + c] & 0xFE;
                    const sVal = data[sIdx + c] & 0xFE;
                    const wVal = data[wIdx + c] & 0xFE;
                    const eVal = data[eIdx + c] & 0xFE;

                    // 2D Laplacian gradyanı: |N - S| + |E - W|
                    score += Math.abs(nVal - sVal) + Math.abs(eVal - wVal);
                }
                scores[rowOffset + x] = score;
            }
        }
        return scores;
    },

    /**
     * Taşıyıcı pikselleri doku skorlarına göre azalan sırada (en yüksek dokudan en düşüğe) sıralar.
     * Eşitlik durumlarında piksel indeksi ikincil anahtar (tie-breaker) olarak kullanılır.
     * 
     * @param {number} width
     * @param {number} height
     * @param {Uint8ClampedArray|Uint8Array} data
     * @returns {Uint32Array} Sıralanmış piksel indisleri dizisi
     */
    getSortedPayloadPixels(width, height, data) {
        const scores = this.computeTextureScores(width, height, data);
        const list = [];

        for (let y = 1; y < height - 1; y++) {
            const rowOffset = y * width;
            for (let x = 1; x < width - 1; x++) {
                if ((x + y) % 2 === 1) {
                    const idx = rowOffset + x;
                    list.push({ idx, score: scores[idx] });
                }
            }
        }

        // Kararlı sıralama (Stable Sort)
        list.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.idx - b.idx;
        });

        const sorted = new Uint32Array(list.length);
        for (let i = 0; i < list.length; i++) {
            sorted[i] = list[i].idx;
        }
        return sorted;
    },

    /**
     * Dinamik Göreli Stego Risk İndeksi (Stego Risk Index)
     * Verinin yüksek dokulu güvenli piksel havuzuna göre oranını değerlendirir.
     * 
     * @param {number} payloadBytes
     * @param {number} width
     * @param {number} height
     * @param {Uint8ClampedArray|Uint8Array} data
     * @param {number} [lsbMode=1]
     * @returns {{
     *   level: 'low'|'medium'|'high',
     *   label: string,
     *   badgeColor: string,
     *   usagePercent: number,
     *   safeTextureBytes: number,
     *   totalPayloadBytes: number,
     *   message: string
     * }}
     */
    calculateStegoRisk(payloadBytes, width, height, data, lsbMode = 1) {
        const scores = this.computeTextureScores(width, height, data);
        let safePixelCount = 0;
        let totalPayloadPixels = 0;
        let totalScore = 0;

        for (let y = 1; y < height - 1; y++) {
            const rowOffset = y * width;
            for (let x = 1; x < width - 1; x++) {
                if ((x + y) % 2 === 1) {
                    const s = scores[rowOffset + x];
                    totalScore += s;
                    totalPayloadPixels++;
                    // Yüksek frekanslı doku eşiği (kenar/varyans skoru >= 12)
                    if (s >= 12) {
                        safePixelCount++;
                    }
                }
            }
        }

        if (totalPayloadPixels < 256) {
            return {
                level: 'high',
                label: 'Yetersiz Görsel',
                badgeColor: 'var(--md-error)',
                usagePercent: 100,
                safeTextureBytes: 0,
                totalPayloadBytes: payloadBytes,
                message: 'Görsel boyutu steganografik gömme için yetersiz (en az 256 taşıyıcı piksel gerekli).'
            };
        }

        // Güvenli yüksek doku kapasitesi (bayt cinsinden, başlık için 256 piksel ayrılır)
        const usableSafePixels = Math.max(0, safePixelCount - 256);
        const channelsPerByte = lsbMode === 2 ? 4 : 8;
        const safeTextureBytes = Math.floor((usableSafePixels * 3) / channelsPerByte);

        const ratio = payloadBytes / Math.max(1, safeTextureBytes);
        const usagePercent = Math.min(999, Math.round(ratio * 100));

        let level = 'low';
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
     * İçerik Duyarlı Dağınık Gömme (Format v3 Adaptive)
     * Veriyi sıralanmış yüksek dokulu pikseller havuzuna PRNG permütasyonu ile gömer.
     * 
     * @param {ImageData} imageData
     * @param {Uint8Array} header48
     * @param {Uint8Array} cipherBody
     * @param {number} lsbMode
     * @param {ArrayBuffer} scatterBits
     * @param {Uint8Array} [salt] - 16 baytlık genel tuz
     * @param {'all'|'even'|'odd'} [partition='all']
     * @param {'matching'|'replacement'} [method='matching']
     * @param {{ strictSafeTexture?: boolean }} [options={}]
     * @returns {ImageData}
     */
    embedAdaptive(imageData, header48, cipherBody, lsbMode, scatterBits, salt, partition = 'all', method = 'matching', options = {}) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        // 1. Genel Salt bloğunu satır 0'a yaz (& 0xFE maskeli piksellerde mutlak değişmezlik için LSB replacement)
        if (salt) {
            for (let b = 0; b < 16; b++) {
                for (let bit = 7; bit >= 0; bit--) {
                    const ch = b * 8 + (7 - bit);
                    const pixelIdx = Math.floor(ch / 3);
                    const rawIdx = pixelIdx * 4 + (ch % 3);
                    const bitVal = (salt[b] >> bit) & 1;
                    data[rawIdx] = (data[rawIdx] & 0xFE) | bitVal;
                }
            }
        }

        // 2. Doku skorlarına göre sıralı taşıyıcı pikseller havuzunu oluştur
        const sortedPixels = this.getSortedPayloadPixels(width, height, data);
        if (sortedPixels.length < 256) {
            throw new Error("Görsel içerik duyarlı gömme için çok küçük (en az 256 taşıyıcı piksel gerekli).");
        }

        // 3. Başlık Bölgesi (Header Zone): En yüksek dokulu ilk 256 piksel (256 * 3 = 768 kanal)
        const headerPixels = sortedPixels.subarray(0, 256);
        const headerChannelsTotal = 256 * 3;
        const { c0: hc0, step: hstep, nPartition: hn } = ScatterEngine.deriveParamsFromBits(scatterBits, headerChannelsTotal, partition);

        let hStepIdx = 0;
        for (let b = 0; b < 48; b++) {
            for (let bit = 7; bit >= 0; bit--) {
                const bitVal = (header48[b] >> bit) & 1;
                const ch = ScatterEngine.getPartitionChannel(hStepIdx++, headerChannelsTotal, hc0, hstep, partition);
                const px = headerPixels[Math.floor(ch / 3)];
                const c = ch % 3;
                const rawIdx = px * 4 + c;

                if (method === 'matching') {
                    data[rawIdx] = matchLsb1(data[rawIdx], bitVal);
                } else {
                    data[rawIdx] = (data[rawIdx] & 0xFE) | bitVal;
                }
            }
        }

        // 4. Gövde Bölgesi (Body Zone): Başlıktan sonraki en yüksek dokulu pikseller
        const channelsPerByte = lsbMode === 2 ? 4 : 8;
        const neededBodyChannels = cipherBody.length * channelsPerByte;
        const neededBodyPixels = Math.ceil((partition === 'all' ? neededBodyChannels : neededBodyChannels * 2) / 3);

        const availableBodyPixels = sortedPixels.length - 256;
        if (neededBodyPixels > availableBodyPixels) {
            throw new Error(`Veri boyutu görselin dokulu alan kapasitesini aşıyor (${neededBodyPixels} piksel gerekli, ${availableBodyPixels} mevcut).`);
        }
        if (options && options.strictSafeTexture && neededBodyPixels > availableBodyPixels * 0.6) {
            throw new Error(`Doku Kapasitesi Aşımı: Veri boyutu yüksek dokulu güvenli bölgeleri aşıyor (${neededBodyPixels} piksel gerekli, sınır: ${Math.floor(availableBodyPixels * 0.6)}).`);
        }

        const bodyPixels = sortedPixels.subarray(256, 256 + neededBodyPixels);
        const bodyChannelsTotal = bodyPixels.length * 3;
        const { c0: bc0, step: bstep, nPartition: bn } = ScatterEngine.deriveParamsFromBits(scatterBits, bodyChannelsTotal, partition);

        let bStepIdx = 0;
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherBody.length; b++) {
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const bitsVal = (cipherBody[b] >> bit) & mask;
                const ch = ScatterEngine.getPartitionChannel(bStepIdx++, bodyChannelsTotal, bc0, bstep, partition);
                const px = bodyPixels[Math.floor(ch / 3)];
                const c = ch % 3;
                const rawIdx = px * 4 + c;

                if (method === 'matching') {
                    if (lsbMode === 2) {
                        data[rawIdx] = matchLsb2(data[rawIdx], bitsVal);
                    } else {
                        data[rawIdx] = matchLsb1(data[rawIdx], bitsVal);
                    }
                } else {
                    data[rawIdx] = (data[rawIdx] & ~mask) | bitsVal;
                }
            }
        }

        return imageData;
    },

    /**
     * İçerik Duyarlı Dağınık Çıkarma (Format v3 Adaptive)
     * 
     * @param {ImageData} imageData
     * @param {CryptoKey} masterKey
     * @param {'all'|'even'|'odd'} [partition='all']
     * @returns {Promise<Uint8Array>}
     */
    async extractAdaptive(imageData, masterKey, partition = 'all') {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;

        const sortedPixels = this.getSortedPayloadPixels(width, height, data);
        if (sortedPixels.length < 256) {
            throw new Error("Görsel içerik duyarlı veri aramak için çok küçük.");
        }

        const label = `v3/${partition}`;
        const { scatterBits, metaKey, bodyKey } = await CryptoEngine.deriveSubkeysV3(masterKey, label);

        // 1. Başlık Bölgesini oku (ilk 256 piksel)
        const headerPixels = sortedPixels.subarray(0, 256);
        const headerChannelsTotal = 256 * 3;
        const { c0: hc0, step: hstep, nPartition: hn } = ScatterEngine.deriveParamsFromBits(scatterBits, headerChannelsTotal, partition);

        const header48 = new Uint8Array(48);
        let hStepIdx = 0;
        for (let b = 0; b < 48; b++) {
            let byteVal = 0;
            for (let bit = 7; bit >= 0; bit--) {
                const ch = ScatterEngine.getPartitionChannel(hStepIdx++, headerChannelsTotal, hc0, hstep, partition);
                const px = headerPixels[Math.floor(ch / 3)];
                const c = ch % 3;
                const rawIdx = px * 4 + c;
                byteVal = (byteVal << 1) | (data[rawIdx] & 1);
            }
            header48[b] = byteVal;
        }

        // 2. Başlığı doğrula (parola veya katman uyuşmazsa anında reddeder)
        const { lsbMode, cipherLen, ivBody } = await CryptoEngine.decryptMetaV3(header48, metaKey);

        // 3. Gövde Bölgesini oku
        const channelsPerByte = lsbMode === 2 ? 4 : 8;
        const neededBodyChannels = cipherLen * channelsPerByte;
        const neededBodyPixels = Math.ceil((partition === 'all' ? neededBodyChannels : neededBodyChannels * 2) / 3);

        const availableBodyPixels = sortedPixels.length - 256;
        if (neededBodyPixels > availableBodyPixels) {
            throw new Error("Görsel eksik veya kırpılmış.");
        }

        const bodyPixels = sortedPixels.subarray(256, 256 + neededBodyPixels);
        const bodyChannelsTotal = bodyPixels.length * 3;
        const { c0: bc0, step: bstep, nPartition: bn } = ScatterEngine.deriveParamsFromBits(scatterBits, bodyChannelsTotal, partition);

        let bStepIdx = 0;
        const cipherBody = new Uint8Array(cipherLen);
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherLen; b++) {
            let byteVal = 0;
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const ch = ScatterEngine.getPartitionChannel(bStepIdx++, bodyChannelsTotal, bc0, bstep, partition);
                const px = bodyPixels[Math.floor(ch / 3)];
                const c = ch % 3;
                const rawIdx = px * 4 + c;
                byteVal = (byteVal << lsbMode) | (data[rawIdx] & mask);
            }
            cipherBody[b] = byteVal;
        }

        // 4. Gövdeyi çöz
        return await CryptoEngine.decryptBodyV3(cipherBody, bodyKey, ivBody);
    }
};
