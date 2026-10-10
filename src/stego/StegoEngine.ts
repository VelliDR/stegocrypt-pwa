/**
 * src/stego/StegoEngine.ts
 * Çok Katmanlı Steganografi Motoru ve Şeffaf Otomatik Çözücü.
 * - Format v3 (Tek PBKDF2 600k + HKDF all/even/odd, LSB Matching).
 * - Format v2 (Dağınık Sıfır-İmza 100k).
 * - Format v1 (Sıralı Mod STG1/STG2/STEG).
 */

import { ScatterEngine } from './ScatterEngine.ts';
import { KeyDerivation } from '../crypto/KeyDerivation.ts';
import { CryptoEngine } from '../crypto/CryptoEngine.ts';
import { AdaptiveEngine } from './AdaptiveEngine.ts';
import { matchLsb1, matchLsb2 } from './MatchingEngine.ts';
import type { LsbMode, EmbedMethod, Partition, SimpleImageData } from '../types/index.ts';

export class BitReader {
    private data: Uint8ClampedArray | Uint8Array;
    public pos: number = 0;
    private bitIdx: number = 0;
    private currentByte: number = 0;

    constructor(data: Uint8ClampedArray | Uint8Array) {
        this.data = data;
    }

    readBytes(count: number, bitsPerChannel: number = 1): Uint8Array {
        const result = new Uint8Array(count);
        let byteIdx = 0;
        const mask = (1 << bitsPerChannel) - 1;

        while (byteIdx < count && this.pos < this.data.length) {
            if ((this.pos + 1) % 4 === 0) {
                this.pos++;
                continue;
            }

            const bits = (this.data[this.pos] ?? 0) & mask;
            this.currentByte = (this.currentByte << bitsPerChannel) | bits;
            this.bitIdx += bitsPerChannel;
            this.pos++;

            if (this.bitIdx >= 8) {
                result[byteIdx++] = this.currentByte;
                this.currentByte = 0;
                this.bitIdx = 0;
            }
        }
        return result.subarray(0, byteIdx);
    }
}

export const StegoEngine = {
    matchLsb1,
    matchLsb2,
    embedAdaptive: (...args: Parameters<typeof AdaptiveEngine.embedAdaptive>) => AdaptiveEngine.embedAdaptive(...args),
    extractAdaptive: (...args: Parameters<typeof AdaptiveEngine.extractAdaptive>) => AdaptiveEngine.extractAdaptive(...args),

    // =========================================================================
    // Sıralı Mod (Format v1)
    // =========================================================================

    embedSequential(
        imageData: SimpleImageData,
        payload: Uint8Array,
        bitsPerChannel: LsbMode = 1,
        method: EmbedMethod = 'matching'
    ): SimpleImageData {
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
            const bit = (payload[byteIdx]! >> (7 - bitIdx)) & 1;
            if (method === 'matching') {
                data[i] = matchLsb1(data[i]!, bit);
            } else {
                data[i] = (data[i]! & 0xFE) | bit;
            }
            bitIdx++;
            if (bitIdx === 8) { bitIdx = 0; byteIdx++; }
        }

        const mask = (1 << bitsPerChannel) - 1;
        for (; i < data.length && byteIdx < payload.length; i++) {
            if ((i + 1) % 4 === 0) continue;
            const shift = 8 - bitsPerChannel - bitIdx;
            const bits = (payload[byteIdx]! >> shift) & mask;
            if (method === 'matching') {
                if (bitsPerChannel === 2) {
                    data[i] = matchLsb2(data[i]!, bits);
                } else {
                    data[i] = matchLsb1(data[i]!, bits);
                }
            } else {
                data[i] = (data[i]! & ~mask) | bits;
            }
            bitIdx += bitsPerChannel;
            if (bitIdx === 8) { bitIdx = 0; byteIdx++; }
        }

        return imageData;
    },

    extractSequential(imageData: SimpleImageData): Uint8Array {
        const data = imageData.data;
        const reader = new BitReader(data);
        const header = reader.readBytes(36, 1);
        if (header.length < 36) throw new Error("Görsel veri okumak için çok küçük.");

        const magic = new TextDecoder().decode(header.subarray(0, 4));
        let lsbMode: LsbMode = 1;
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
    // FORMAT v3: Homojen Dağınık Mod (Uniform Scattered)
    // =========================================================================

    writeSaltV3(data: Uint8ClampedArray | Uint8Array, salt: Uint8Array, method: EmbedMethod = 'matching'): void {
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
    },

    readSaltV3(data: Uint8ClampedArray | Uint8Array): Uint8Array {
        const salt = new Uint8Array(16);
        for (let b = 0; b < 16; b++) {
            let byteVal = 0;
            for (let bit = 7; bit >= 0; bit--) {
                const ch = b * 8 + (7 - bit);
                const pixelIdx = Math.floor(ch / 3);
                const rawIdx = pixelIdx * 4 + (ch % 3);
                byteVal = (byteVal << 1) | (data[rawIdx]! & 1);
            }
            salt[b] = byteVal;
        }
        return salt;
    },

    embedV3(
        imageData: SimpleImageData,
        header48: Uint8Array,
        cipherBody: Uint8Array,
        lsbMode: LsbMode,
        scatterBits: ArrayBuffer,
        salt: Uint8Array | null = null,
        partition: Partition = 'all',
        method: EmbedMethod = 'matching'
    ): SimpleImageData {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);
        const saltChannels = 128;

        if (totalUsableChannels <= saltChannels + 48 * 8) {
            throw new Error("Görsel veri gömmek için çok küçük.");
        }

        const payloadChannels = totalUsableChannels - saltChannels;
        const { c0, step, nPartition } = ScatterEngine.deriveParamsFromBits(scatterBits, payloadChannels, partition);

        const headerChannelsNeeded = 48 * 8;
        const channelsPerBodyByte = lsbMode === 2 ? 4 : 8;
        const bodyChannelsNeeded = cipherBody.length * channelsPerBodyByte;
        const totalNeeded = headerChannelsNeeded + bodyChannelsNeeded;

        if (totalNeeded > nPartition) {
            throw new Error(`Veri boyutu görsel/katman kapasitesini aşıyor (${totalNeeded} kanal gerekli, ${nPartition} mevcut).`);
        }

        if (salt) {
            this.writeSaltV3(data, salt, method);
        }

        function getRawIndex(stepIdx: number): number {
            const pIdx = (c0 + stepIdx * step) % nPartition;
            let payloadChannel = pIdx;
            if (partition === 'even') payloadChannel = pIdx * 2;
            else if (partition === 'odd') payloadChannel = pIdx * 2 + 1;
            const actualChannel = saltChannels + payloadChannel;
            const pixelIndex = Math.floor(actualChannel / 3);
            const colorOffset = actualChannel % 3;
            return pixelIndex * 4 + colorOffset;
        }

        let stepIdx = 0;
        for (let b = 0; b < 48; b++) {
            for (let bit = 7; bit >= 0; bit--) {
                const bitVal = (header48[b]! >> bit) & 1;
                const rawIdx = getRawIndex(stepIdx++);
                if (method === 'matching') {
                    data[rawIdx] = matchLsb1(data[rawIdx]!, bitVal);
                } else {
                    data[rawIdx] = (data[rawIdx]! & 0xFE) | bitVal;
                }
            }
        }

        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherBody.length; b++) {
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const bitsVal = (cipherBody[b]! >> bit) & mask;
                const rawIdx = getRawIndex(stepIdx++);
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

    async extractV3(imageData: SimpleImageData, masterKey: CryptoKey, partition: Partition = 'all'): Promise<Uint8Array> {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);
        const saltChannels = 128;

        if (totalUsableChannels <= saltChannels + 48 * 8) {
            throw new Error("Görsel veri okumak için çok küçük.");
        }

        const payloadChannels = totalUsableChannels - saltChannels;
        const label = `v3/${partition}` as const;
        const { scatterBits, metaKey, bodyKey } = await KeyDerivation.deriveSubkeysV3(masterKey, label);
        const { c0, step, nPartition } = ScatterEngine.deriveParamsFromBits(scatterBits, payloadChannels, partition);

        function getRawIndex(stepIdx: number): number {
            const pIdx = (c0 + stepIdx * step) % nPartition;
            let payloadChannel = pIdx;
            if (partition === 'even') payloadChannel = pIdx * 2;
            else if (partition === 'odd') payloadChannel = pIdx * 2 + 1;
            const actualChannel = saltChannels + payloadChannel;
            const pixelIndex = Math.floor(actualChannel / 3);
            const colorOffset = actualChannel % 3;
            return pixelIndex * 4 + colorOffset;
        }

        const header48 = new Uint8Array(48);
        let stepIdx = 0;
        for (let b = 0; b < 48; b++) {
            let byteVal = 0;
            for (let bit = 7; bit >= 0; bit--) {
                const rawIdx = getRawIndex(stepIdx++);
                const bitVal = data[rawIdx]! & 1;
                byteVal = (byteVal << 1) | bitVal;
            }
            header48[b] = byteVal;
        }

        const { lsbMode, cipherLen, ivBody } = await CryptoEngine.decryptMetaV3(header48, metaKey as CryptoKey);

        const channelsPerBodyByte = lsbMode === 2 ? 4 : 8;
        const neededBodyChannels = cipherLen * channelsPerBodyByte;
        if (stepIdx + neededBodyChannels > nPartition) {
            throw new Error("Görsel eksik veya kırpılmış.");
        }

        const cipherBody = new Uint8Array(cipherLen);
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherLen; b++) {
            let byteVal = 0;
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const rawIdx = getRawIndex(stepIdx++);
                const bitsVal = data[rawIdx]! & mask;
                byteVal = (byteVal << lsbMode) | bitsVal;
            }
            cipherBody[b] = byteVal;
        }

        return await CryptoEngine.decryptBodyV3(cipherBody, bodyKey as CryptoKey, ivBody);
    },

    // =========================================================================
    // Format v2 Dağınık Sıfır-İmza (ZeroSig)
    // =========================================================================

    async embedScattered(
        imageData: SimpleImageData,
        header64: Uint8Array,
        cipherBody: Uint8Array,
        lsbMode: LsbMode,
        password: string,
        partition: Partition = 'all'
    ): Promise<SimpleImageData> {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);
        const { c0, step, nPartition } = await ScatterEngine.deriveParams(password, totalUsableChannels, partition);

        const headerChannels = 64 * 8;
        const channelsPerBodyByte = lsbMode === 2 ? 4 : 8;
        const bodyChannels = cipherBody.length * channelsPerBodyByte;
        const totalNeededChannels = headerChannels + bodyChannels;

        if (totalNeededChannels > nPartition) {
            throw new Error(`Veri boyutu görsel/katman kapasitesini aşıyor (${totalNeededChannels} kanal gerekli, ${nPartition} mevcut).`);
        }

        let stepIdx = 0;
        for (let b = 0; b < 64; b++) {
            for (let bit = 7; bit >= 0; bit--) {
                const bitVal = (header64[b]! >> bit) & 1;
                const rawIdx = ScatterEngine.getPartitionRawIndex(stepIdx++, totalUsableChannels, c0, step, partition);
                data[rawIdx] = (data[rawIdx]! & 0xFE) | bitVal;
            }
        }

        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherBody.length; b++) {
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const bitsVal = (cipherBody[b]! >> bit) & mask;
                const rawIdx = ScatterEngine.getPartitionRawIndex(stepIdx++, totalUsableChannels, c0, step, partition);
                data[rawIdx] = (data[rawIdx]! & ~mask) | bitsVal;
            }
        }

        return imageData;
    },

    async extractScattered(imageData: SimpleImageData, password: string, partition: Partition = 'all'): Promise<Uint8Array> {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);
        const { c0, step, nPartition } = await ScatterEngine.deriveParams(password, totalUsableChannels, partition);

        const header64 = new Uint8Array(64);
        let stepIdx = 0;
        for (let b = 0; b < 64; b++) {
            let byteVal = 0;
            for (let bit = 7; bit >= 0; bit--) {
                const rawIdx = ScatterEngine.getPartitionRawIndex(stepIdx++, totalUsableChannels, c0, step, partition);
                const bitVal = data[rawIdx]! & 1;
                byteVal = (byteVal << 1) | bitVal;
            }
            header64[b] = byteVal;
        }

        const { key, ivBody, lsbMode, cipherLen } = await CryptoEngine.decryptZeroSigHeader(header64, password);

        const channelsPerBodyByte = lsbMode === 2 ? 4 : 8;
        const neededBodyChannels = cipherLen * channelsPerBodyByte;
        if (stepIdx + neededBodyChannels > nPartition) {
            throw new Error("Görsel eksik veya kırpılmış.");
        }

        const cipherBody = new Uint8Array(cipherLen);
        const mask = (1 << lsbMode) - 1;
        for (let b = 0; b < cipherLen; b++) {
            let byteVal = 0;
            for (let bit = 8 - lsbMode; bit >= 0; bit -= lsbMode) {
                const rawIdx = ScatterEngine.getPartitionRawIndex(stepIdx++, totalUsableChannels, c0, step, partition);
                const bitsVal = data[rawIdx]! & mask;
                byteVal = (byteVal << lsbMode) | bitsVal;
            }
            cipherBody[b] = byteVal;
        }

        return await CryptoEngine.decryptZeroSigBody(cipherBody, key as CryptoKey, ivBody);
    },

    // =========================================================================
    // Akıllı Şeffaf Otomatik Çözücü (extractAuto)
    // =========================================================================

    async extractAuto(imageData: SimpleImageData, password: string): Promise<Uint8Array> {
        const data = imageData.data;
        const totalUsableChannels = Math.floor((data.length / 4) * 3);

        // 1. ÖNCELİK: Format v3 (PBKDF2 600k veya Argon2id SIMD Wasm + HKDF)
        if (totalUsableChannels > 128 + 48 * 8) {
            const salt = this.readSaltV3(data);
            const v3Partitions: Partition[] = ['all', 'even', 'odd'];

            // 1.a PBKDF2 600.000 İterasyon Denemesi
            try {
                const masterKeyPBKDF2 = await KeyDerivation.deriveMasterKeyV3(password, salt, 600000);
                // İçerik Duyarlı Mod (Adaptive Texture)
                for (const part of v3Partitions) {
                    try {
                        return await AdaptiveEngine.extractAdaptive(imageData, masterKeyPBKDF2, part);
                    } catch {
                        // Katman uyuşmazsa devam
                    }
                }
                // Homojen Dağınık Mod (Uniform Scattered)
                for (const part of v3Partitions) {
                    try {
                        return await this.extractV3(imageData, masterKeyPBKDF2, part);
                    } catch {
                        // Katman uyuşmazsa devam
                    }
                }
            } catch {
                // PBKDF2 başarısız olursa sonraki KDF'e geç
            }

            // 1.b Argon2id (Bellek-Zorlu SIMD Wasm 64MB) Denemesi
            try {
                const masterKeyArgon2 = await KeyDerivation.deriveMasterKeyArgon2id(password, salt);
                // İçerik Duyarlı Mod (Adaptive Texture)
                for (const part of v3Partitions) {
                    try {
                        return await AdaptiveEngine.extractAdaptive(imageData, masterKeyArgon2, part);
                    } catch {
                        // Katman uyuşmazsa devam
                    }
                }
                // Homojen Dağınık Mod (Uniform Scattered)
                for (const part of v3Partitions) {
                    try {
                        return await this.extractV3(imageData, masterKeyArgon2, part);
                    } catch {
                        // Katman uyuşmazsa devam
                    }
                }
            } catch {
                // Argon2id de başarısız olursa v2/v1 formatlarına geç
            }
        }

        // 2. ÖNCELİK: Format v2 Sıfır-İmza ('all' -> 'even' -> 'odd')
        const candidatePartitions: Partition[] = ['all', 'even', 'odd'];
        for (const part of candidatePartitions) {
            try {
                return await this.extractScattered(imageData, password, part);
            } catch {
                // Katman uyuşmazsa devam
            }
        }

        // 3. ÖNCELİK: Format v1 Sıralı Mod (STG1/STG2/STEG)
        const reader = new BitReader(data);
        const first4 = reader.readBytes(4, 1);
        const magic = new TextDecoder().decode(first4);

        if (magic === "STG1" || magic === "STG2" || magic === "STEG") {
            try {
                const payload = this.extractSequential(imageData);
                return await CryptoEngine.decryptBuffer(payload, password);
            } catch {
                throw new Error(`Görselde şifreli StegoCrypt paketi (${magic}) tespit edildi; ancak parola hatalı veya kimlik doğrulama başarısız.`);
            }
        }

        throw new Error("Parola yanlış veya bu görselde şifreli veri bulunamadı.");
    }
};
