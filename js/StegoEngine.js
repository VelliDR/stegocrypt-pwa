/**
 * StegoEngine.js (Faz 3: İnkâr Edilebilir Şifreleme & Çoklu Katman Desteği)
 * - İnkâr Edilebilir Mod: Tek görselde çift bağımsız katman (Tuzak: 'even', Gerçek: 'odd').
 * - Tekil Dağınık Mod: Tüm piksellere homojen dağıtım ('all').
 * - Sıralı Mod: Klasik format geriye dönük uyumluluğu.
 * - Akıllı Çözücü: Parolaya uyan katmanı ('all' -> 'even' -> 'odd' -> 'seq') otomatik bulur.
 */
import { ScatterEngine } from './ScatterEngine.js';
import { CryptoEngine } from './CryptoEngine.js';

/**
 * LSB Matching 1-bit (±1):
 * Eğer pikselin son biti hedef bite eşitse pikseli korur.
 * Değilse, rastgele +1 veya -1 ekler. 0 ve 255 sınırlarını taşmaya karşı korur.
 */
export function matchLsb1(val, targetBit, randChoice = Math.random() < 0.5) {
    if ((val & 1) === targetBit) return val;
    if (val === 0) return 1;
    if (val === 255) return 254;
    return randChoice ? val + 1 : val - 1;
}

/**
 * LSB Matching 2-bit (|Δ| <= 2):
 * Hedef 2-bit değerine sahip ve |Δ| en küçük olan değeri seçer.
 * Eşitlik durumunda (örn. delta = -2 ve +2) rastgele seçim yapar.
 */
export function matchLsb2(val, targetBits, randChoice = Math.random() < 0.5) {
    const curr = val & 3;
    if (curr === targetBits) return val;

    let bestDiff = 999;
    let candidates = [];
    for (const delta of [-2, 2, -1, 1, -3, 3]) {
        const cand = val + delta;
        if (cand >= 0 && cand <= 255 && (cand & 3) === targetBits) {
            const absDiff = Math.abs(delta);
            if (absDiff < bestDiff) {
                bestDiff = absDiff;
                candidates = [cand];
            } else if (absDiff === bestDiff) {
                candidates.push(cand);
            }
        }
    }
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
        return randChoice ? candidates[0] : candidates[1];
    }
    return (val & ~3) | targetBits;
}

export const StegoEngine = {
    matchLsb1,
    matchLsb2,

    /**
     * Dağınık Mod (PRNG): Başlığı (1-LSB) ve gövdeyi (1 veya 2-LSB) homojen şekilde saçar.
     * @param {ImageData} imageData
     * @param {Uint8Array} header64
     * @param {Uint8Array} cipherBody
     * @param {number} lsbMode
     * @param {string} password
     * @param {'all'|'even'|'odd'} [partition='all']
     * @returns {Promise<ImageData>}
     */
    async embedScattered(imageData, header64, cipherBody, lsbMode, password, partition = 'all') {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);
        const { c0, step, nPartition } = await ScatterEngine.deriveParams(password, totalUsableChannels, partition);

        const headerChannels = 64 * 8; // 64 bayt = 512 kanal
        const channelsPerBodyByte = lsbMode === 2 ? 4 : 8;
        const bodyChannels = cipherBody.length * channelsPerBodyByte;
        const totalNeededChannels = headerChannels + bodyChannels;

        if (totalNeededChannels > nPartition) {
            throw new Error(`Veri boyutu görsel/katman kapasitesini aşıyor (${totalNeededChannels} kanal gerekli, ${nPartition} mevcut).`);
        }

        let stepIdx = 0;

        // 1. AŞAMA: 64 baytlık başlığı 1-LSB ile dağıt
        for (let b = 0; b < 64; b++) {
            for (let bit = 7; bit >= 0; bit--) {
                const bitVal = (header64[b] >> bit) & 1;
                const rawIdx = ScatterEngine.getPartitionRawIndex(stepIdx++, totalUsableChannels, c0, step, partition);
                data[rawIdx] = (data[rawIdx] & 0xFE) | bitVal;
            }
        }

        // 2. AŞAMA: Gövdeyi lsbMode (1 veya 2) ile dağıt
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherBody.length; b++) {
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const bitsVal = (cipherBody[b] >> bit) & mask;
                const rawIdx = ScatterEngine.getPartitionRawIndex(stepIdx++, totalUsableChannels, c0, step, partition);
                data[rawIdx] = (data[rawIdx] & ~mask) | bitsVal;
            }
        }

        return imageData;
    },

    /**
     * Dağınık Mod (PRNG): Belirtilen bölümden (all/even/odd) veriyi toplayıp çözer.
     * @param {ImageData} imageData
     * @param {string} password
     * @param {'all'|'even'|'odd'} [partition='all']
     * @returns {Promise<Uint8Array>}
     */
    async extractScattered(imageData, password, partition = 'all') {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);
        const { c0, step, nPartition } = await ScatterEngine.deriveParams(password, totalUsableChannels, partition);

        // 1. AŞAMA: 64 baytlık Zero-Sig başlığı topla
        const header64 = new Uint8Array(64);
        let stepIdx = 0;
        for (let b = 0; b < 64; b++) {
            let byteVal = 0;
            for (let bit = 7; bit >= 0; bit--) {
                const rawIdx = ScatterEngine.getPartitionRawIndex(stepIdx++, totalUsableChannels, c0, step, partition);
                const bitVal = data[rawIdx] & 1;
                byteVal = (byteVal << 1) | bitVal;
            }
            header64[b] = byteVal;
        }

        // 2. AŞAMA: Başlığı doğrula ve çöz (parola yanlışsa anında fırlatır)
        const { key, ivBody, lsbMode, cipherLen } = await CryptoEngine.decryptZeroSigHeader(header64, password);

        const channelsPerBodyByte = lsbMode === 2 ? 4 : 8;
        const neededBodyChannels = cipherLen * channelsPerBodyByte;
        if (stepIdx + neededBodyChannels > nPartition) {
            throw new Error("Görsel eksik veya kırpılmış.");
        }

        // 3. AŞAMA: Gövdeyi topla
        const cipherBody = new Uint8Array(cipherLen);
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherLen; b++) {
            let byteVal = 0;
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const rawIdx = ScatterEngine.getPartitionRawIndex(stepIdx++, totalUsableChannels, c0, step, partition);
                const bitsVal = data[rawIdx] & mask;
                byteVal = (byteVal << lsbMode) | bitsVal;
            }
            cipherBody[b] = byteVal;
        }

        // 4. AŞAMA: Gövdeyi çöz
        return await CryptoEngine.decryptZeroSigBody(cipherBody, key, ivBody);
    },

    /**
     * Sıralı Mod (Klasik)
     */
    embedSequential(imageData, payload, bitsPerChannel = 1, method = 'matching') {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);
        const headerChannels = 36 * 8;

        if (totalUsableChannels < headerChannels) {
            throw new Error("Görsel veri gömmek için çok küçük.");
        }

        const remainingChannels = totalUsableChannels - headerChannels;
        const maxBodyBytes = Math.floor((remainingChannels * bitsPerChannel) / 8);
        const maxTotalBytes = 36 + maxBodyBytes;

        if (payload.length > maxTotalBytes) {
            throw new Error(`Veri boyutu görsel kapasitesini aşıyor (Maks: ${maxTotalBytes} bayt).`);
        }

        let byteIdx = 0;
        let bitIdx = 0;
        let i = 0;

        for (; i < data.length && byteIdx < 36; i++) {
            if ((i + 1) % 4 === 0) continue;
            const bit = (payload[byteIdx] >> (7 - bitIdx)) & 1;
            if (method === 'matching') {
                data[i] = matchLsb1(data[i], bit);
            } else {
                data[i] = (data[i] & 0xFE) | bit;
            }
            bitIdx++;
            if (bitIdx === 8) { bitIdx = 0; byteIdx++; }
        }

        const mask = (1 << bitsPerChannel) - 1;
        for (; i < data.length && byteIdx < payload.length; i++) {
            if ((i + 1) % 4 === 0) continue;
            const shift = 8 - bitsPerChannel - bitIdx;
            const bits = (payload[byteIdx] >> shift) & mask;
            if (method === 'matching') {
                if (bitsPerChannel === 2) {
                    data[i] = matchLsb2(data[i], bits);
                } else {
                    data[i] = matchLsb1(data[i], bits);
                }
            } else {
                data[i] = (data[i] & ~mask) | bits;
            }
            bitIdx += bitsPerChannel;
            if (bitIdx === 8) { bitIdx = 0; byteIdx++; }
        }

        return imageData;
    },

    extractSequential(imageData) {
        const data = imageData.data;
        const reader = new BitReader(data);
        const header = reader.readBytes(36, 1);
        if (header.length < 36) throw new Error("Görsel veri okumak için çok küçük.");

        const magic = new TextDecoder().decode(header.slice(0, 4));
        let lsbMode = 1;
        if (magic === "STG2") lsbMode = 2;
        else if (magic === "STG1" || magic === "STEG") lsbMode = 1;
        else throw new Error("Bu görselde sıralı şifreli veri bulunamadı.");

        const view = new DataView(header.buffer, header.byteOffset, 36);
        const cipherLen = view.getUint32(4, false);

        const remainingPixels = Math.floor((data.length - reader.pos) / 4);
        const maxPossibleBodyBytes = Math.floor((remainingPixels * 3 * lsbMode) / 8);

        if (cipherLen === 0 || cipherLen > maxPossibleBodyBytes) {
            throw new Error("Geçersiz veya bozuk şifreli veri paketi boyutu.");
        }

        const body = reader.readBytes(cipherLen, lsbMode);
        if (body.length < cipherLen) throw new Error("Eksik veri: Görsel kırpılmış veya bozulmuş.");

        const payload = new Uint8Array(36 + cipherLen);
        payload.set(header, 0);
        payload.set(body, 36);
        return payload;
    },

    // =========================================================================
    // FORMAT v3: Public Salt + HKDF Çoklu Katman Motoru (600.000 KDF)
    // =========================================================================

    writeSaltV3(data, salt, method = 'matching') {
        for (let b = 0; b < 16; b++) {
            for (let bit = 7; bit >= 0; bit--) {
                const ch = b * 8 + (7 - bit);
                const pixelIdx = Math.floor(ch / 3);
                const rawIdx = pixelIdx * 4 + (ch % 3);
                const bitVal = (salt[b] >> bit) & 1;
                if (method === 'matching') {
                    data[rawIdx] = matchLsb1(data[rawIdx], bitVal);
                } else {
                    data[rawIdx] = (data[rawIdx] & 0xFE) | bitVal;
                }
            }
        }
    },

    readSaltV3(data) {
        const salt = new Uint8Array(16);
        for (let b = 0; b < 16; b++) {
            let byteVal = 0;
            for (let bit = 7; bit >= 0; bit--) {
                const ch = b * 8 + (7 - bit);
                const pixelIdx = Math.floor(ch / 3);
                const rawIdx = pixelIdx * 4 + (ch % 3);
                byteVal = (byteVal << 1) | (data[rawIdx] & 1);
            }
            salt[b] = byteVal;
        }
        return salt;
    },

    /**
     * Format v3 Dağınık Gömme (Public Salt + HKDF)
     * @param {ImageData} imageData
     * @param {Uint8Array} header48
     * @param {Uint8Array} cipherBody
     * @param {number} lsbMode
     * @param {ArrayBuffer} scatterBits
     * @param {Uint8Array} [salt] - 16 bayt genel tuz
     * @param {'all'|'even'|'odd'} [partition='all']
     * @param {'matching'|'replacement'} [method='matching'] - LSB Matching (±1) veya LSB Replacement
     * @returns {ImageData}
     */
    embedV3(imageData, header48, cipherBody, lsbMode, scatterBits, salt, partition = 'all', method = 'matching') {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);
        const saltChannels = 128; // 16 bayt = 128 kanal

        if (totalUsableChannels <= saltChannels + 48 * 8) {
            throw new Error("Görsel veri gömmek için çok küçük.");
        }

        const payloadChannels = totalUsableChannels - saltChannels;
        const { c0, step, nPartition } = ScatterEngine.deriveParamsFromBits(scatterBits, payloadChannels, partition);

        const headerChannelsNeeded = 48 * 8; // 48 bayt = 384 kanal
        const channelsPerBodyByte = lsbMode === 2 ? 4 : 8;
        const bodyChannelsNeeded = cipherBody.length * channelsPerBodyByte;
        const totalNeeded = headerChannelsNeeded + bodyChannelsNeeded;

        if (totalNeeded > nPartition) {
            throw new Error(`Veri boyutu görsel/katman kapasitesini aşıyor (${totalNeeded} kanal gerekli, ${nPartition} mevcut).`);
        }

        // 1. Genel Salt bloğunu yaz (eğer verilmişse)
        if (salt) {
            this.writeSaltV3(data, salt, method);
        }

        function getRawIndex(stepIdx) {
            const pIdx = (c0 + stepIdx * step) % nPartition;
            let payloadChannel = pIdx;
            if (partition === 'even') {
                payloadChannel = pIdx * 2;
            } else if (partition === 'odd') {
                payloadChannel = pIdx * 2 + 1;
            }
            const actualChannel = saltChannels + payloadChannel;
            const pixelIndex = Math.floor(actualChannel / 3);
            const colorOffset = actualChannel % 3;
            return pixelIndex * 4 + colorOffset;
        }

        let stepIdx = 0;

        // 2. 48 baytlık başlığı 1-LSB ile dağıt
        for (let b = 0; b < 48; b++) {
            for (let bit = 7; bit >= 0; bit--) {
                const bitVal = (header48[b] >> bit) & 1;
                const rawIdx = getRawIndex(stepIdx++);
                if (method === 'matching') {
                    data[rawIdx] = matchLsb1(data[rawIdx], bitVal);
                } else {
                    data[rawIdx] = (data[rawIdx] & 0xFE) | bitVal;
                }
            }
        }

        // 3. Gövdeyi lsbMode ile dağıt
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherBody.length; b++) {
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const bitsVal = (cipherBody[b] >> bit) & mask;
                const rawIdx = getRawIndex(stepIdx++);
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
     * Format v3 Dağınık Çıkarma (Master Key + HKDF)
     * @param {ImageData} imageData
     * @param {CryptoKey} masterKey
     * @param {'all'|'even'|'odd'} [partition='all']
     * @returns {Promise<Uint8Array>}
     */
    async extractV3(imageData, masterKey, partition = 'all') {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);
        const saltChannels = 128;

        if (totalUsableChannels <= saltChannels + 48 * 8) {
            throw new Error("Görsel veri okumak için çok küçük.");
        }

        const payloadChannels = totalUsableChannels - saltChannels;
        const label = `v3/${partition}`;
        const { scatterBits, metaKey, bodyKey } = await CryptoEngine.deriveSubkeysV3(masterKey, label);
        const { c0, step, nPartition } = ScatterEngine.deriveParamsFromBits(scatterBits, payloadChannels, partition);

        function getRawIndex(stepIdx) {
            const pIdx = (c0 + stepIdx * step) % nPartition;
            let payloadChannel = pIdx;
            if (partition === 'even') {
                payloadChannel = pIdx * 2;
            } else if (partition === 'odd') {
                payloadChannel = pIdx * 2 + 1;
            }
            const actualChannel = saltChannels + payloadChannel;
            const pixelIndex = Math.floor(actualChannel / 3);
            const colorOffset = actualChannel % 3;
            return pixelIndex * 4 + colorOffset;
        }

        // 1. 48 baytlık başlığı topla
        const header48 = new Uint8Array(48);
        let stepIdx = 0;
        for (let b = 0; b < 48; b++) {
            let byteVal = 0;
            for (let bit = 7; bit >= 0; bit--) {
                const rawIdx = getRawIndex(stepIdx++);
                const bitVal = data[rawIdx] & 1;
                byteVal = (byteVal << 1) | bitVal;
            }
            header48[b] = byteVal;
        }

        // 2. Başlığı doğrula (parola veya katman uyuşmazsa anında reddeder)
        const { lsbMode, cipherLen, ivBody } = await CryptoEngine.decryptMetaV3(header48, metaKey);

        const channelsPerBodyByte = lsbMode === 2 ? 4 : 8;
        const neededBodyChannels = cipherLen * channelsPerBodyByte;
        if (stepIdx + neededBodyChannels > nPartition) {
            throw new Error("Görsel eksik veya kırpılmış.");
        }

        // 3. Gövdeyi topla
        const cipherBody = new Uint8Array(cipherLen);
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherLen; b++) {
            let byteVal = 0;
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const rawIdx = getRawIndex(stepIdx++);
                const bitsVal = data[rawIdx] & mask;
                byteVal = (byteVal << lsbMode) | bitsVal;
            }
            cipherBody[b] = byteVal;
        }

        // 4. Gövdeyi çöz
        return await CryptoEngine.decryptBodyV3(cipherBody, bodyKey, ivBody);
    },

    /**
     * Akıllı Otomatik Çözücü:
     * 1. Format v3 (Tek PBKDF2 600k + HKDF 'v3/all' -> 'v3/even' -> 'v3/odd')
     * 2. Format v2 Dağınık Sıfır İmza (100k, 'all' -> 'even' -> 'odd')
     * 3. Format v1 Sıralı Mod (STG1/STG2/STEG)
     */
    async extractAuto(imageData, password) {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);

        // 1. ÖNCELİK: Format v3 (Tek 600k PBKDF2 + HKDF çoklu katman)
        if (totalUsableChannels > 128 + 48 * 8) {
            try {
                const salt = this.readSaltV3(data);
                const masterKey = await CryptoEngine.deriveMasterKeyV3(password, salt, 600000);

                const v3Partitions = ['all', 'even', 'odd'];
                for (const part of v3Partitions) {
                    try {
                        return await this.extractV3(imageData, masterKey, part);
                    } catch {
                        // Bu v3 katmanı değilse diğerini dene
                    }
                }
            } catch {
                // v3 başarısız olursa geriye uyumluluk katmanlarına geç
            }
        }

        // 2. ÖNCELİK: Format v2 Sıfır İmza Dağınık Mod ('all' -> 'even' -> 'odd')
        const candidatePartitions = ['all', 'even', 'odd'];
        for (const part of candidatePartitions) {
            try {
                return await this.extractScattered(imageData, password, part);
            } catch {
                // Bu katman değilse sonrakini dene
            }
        }

        // 3. ÖNCELİK: Format v1 Sıralı Kontrol (STG1/STG2/STEG)
        const reader = new BitReader(data);
        const first4 = reader.readBytes(4, 1);
        const magic = new TextDecoder().decode(first4);

        if (magic === "STG1" || magic === "STG2" || magic === "STEG") {
            try {
                const payload = this.extractSequential(imageData);
                return await CryptoEngine.decryptBuffer(payload, password);
            } catch {
                // Başarısızsa devam et
            }
        }

        throw new Error("Parola yanlış veya bu görselde şifreli veri bulunamadı.");
    }
};

class BitReader {
    constructor(data) {
        this.data = data;
        this.pos = 0;
        this.bitIdx = 0;
        this.currentByte = 0;
    }

    readBytes(count, bitsPerChannel = 1) {
        const result = new Uint8Array(count);
        let byteIdx = 0;
        const mask = (1 << bitsPerChannel) - 1;

        while (byteIdx < count && this.pos < this.data.length) {
            if ((this.pos + 1) % 4 === 0) {
                this.pos++;
                continue;
            }

            const bits = this.data[this.pos] & mask;
            this.currentByte = (this.currentByte << bitsPerChannel) | bits;
            this.bitIdx += bitsPerChannel;
            this.pos++;

            if (this.bitIdx >= 8) {
                result[byteIdx++] = this.currentByte;
                this.currentByte = 0;
                this.bitIdx = 0;
            }
        }
        return result.slice(0, byteIdx);
    }
}