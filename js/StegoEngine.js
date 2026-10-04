/**
 * StegoEngine.js (Faz 3: İnkâr Edilebilir Şifreleme & Çoklu Katman Desteği)
 * - İnkâr Edilebilir Mod: Tek görselde çift bağımsız katman (Tuzak: 'even', Gerçek: 'odd').
 * - Tekil Dağınık Mod: Tüm piksellere homojen dağıtım ('all').
 * - Sıralı Mod: Klasik format geriye dönük uyumluluğu.
 * - Akıllı Çözücü: Parolaya uyan katmanı ('all' -> 'even' -> 'odd' -> 'seq') otomatik bulur.
 */
import { ScatterEngine } from './ScatterEngine.js';
import { CryptoEngine } from './CryptoEngine.js';

export const StegoEngine = {
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
    embedSequential(imageData, payload, bitsPerChannel = 1) {
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
            data[i] = (data[i] & 0xFE) | bit;
            bitIdx++;
            if (bitIdx === 8) { bitIdx = 0; byteIdx++; }
        }

        const mask = (1 << bitsPerChannel) - 1;
        for (; i < data.length && byteIdx < payload.length; i++) {
            if ((i + 1) % 4 === 0) continue;
            const shift = 8 - bitsPerChannel - bitIdx;
            const bits = (payload[byteIdx] >> shift) & mask;
            data[i] = (data[i] & ~mask) | bits;
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

    /**
     * Akıllı Otomatik Çözücü:
     * 1. Sıralı mod başlığı kontrolü (STG1/STG2/STEG)
     * 2. Dağınık Tekil Mod ('all')
     * 3. İnkâr Edilebilir Tuzak Katman ('even')
     * 4. İnkâr Edilebilir Gerçek Katman ('odd')
     */
    async extractAuto(imageData, password) {
        const data = imageData.data;

        // 1. Sıralı kontrol
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

        // 2. Dağınık mod katmanları: 'all' -> 'even' -> 'odd'
        const candidatePartitions = ['all', 'even', 'odd'];
        for (const part of candidatePartitions) {
            try {
                return await this.extractScattered(imageData, password, part);
            } catch {
                // Bu katman değilse sonrakini dene
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