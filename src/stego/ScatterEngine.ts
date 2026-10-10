/**
 * src/stego/ScatterEngine.ts
 * Afin Permütasyon ve Deterministik Dağıtım Motoru.
 * P(i) = (c0 + i * step) mod N
 * step ile N aralarında asal (coprime) seçilerek çakışmasız birebir eşleme (bijection) sağlanır.
 */

import type { Partition, ScatterParams } from '../types/index.ts';

function gcd(a: number, b: number): number {
    while (b !== 0) {
        const t = b;
        b = a % b;
        a = t;
    }
    return a;
}

export const ScatterEngine = {
    /**
     * Paroladan ve kanal sayısından deterministik PRNG parametrelerini türetir.
     */
    async deriveParams(password: string, totalChannels: number, partition: Partition = 'all'): Promise<ScatterParams> {
        let n = totalChannels;
        if (partition === 'even') {
            n = Math.floor((totalChannels + 1) / 2);
        } else if (partition === 'odd') {
            n = Math.floor(totalChannels / 2);
        }

        if (n <= 0) throw new Error("Yetersiz kanal sayısı.");

        const pwBytes = new TextEncoder().encode(password);
        const salt = new TextEncoder().encode(`scatter-v2-${partition}`);
        const keyMaterial = await crypto.subtle.importKey('raw', pwBytes, 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' },
            keyMaterial,
            256
        );

        return this.deriveParamsFromBits(bits, totalChannels, partition);
    },

    /**
     * 256-bit hazır buffer'dan anında parametre türetir.
     */
    deriveParamsFromBits(scatterBits: ArrayBuffer, totalChannels: number, partition: Partition = 'all'): ScatterParams {
        let n = totalChannels;
        if (partition === 'even') {
            n = Math.floor((totalChannels + 1) / 2);
        } else if (partition === 'odd') {
            n = Math.floor(totalChannels / 2);
        }

        if (n <= 0) throw new Error("Yetersiz kanal sayısı.");
        if (n === 1) return { c0: 0, step: 1, nPartition: 1 };

        const view = new DataView(scatterBits);
        const c0_raw = view.getUint32(0, false);
        const step_raw = view.getUint32(4, false);

        const c0 = c0_raw % n;
        let step = (step_raw % (n - 1)) + 1;
        while (gcd(step, n) !== 1) {
            step = (step + 1) % n;
            if (step === 0) step = 1;
        }

        return { c0, step, nPartition: n };
    },

    /**
     * Partisyon içindeki adım indisini fiziksel RGBA piksel dizisi indeksine dönüştürür.
     */
    getPartitionRawIndex(stepIdx: number, totalChannels: number, c0: number, step: number, partition: Partition = 'all'): number {
        let n = totalChannels;
        if (partition === 'even') n = Math.floor((totalChannels + 1) / 2);
        else if (partition === 'odd') n = Math.floor(totalChannels / 2);

        const pIdx = (c0 + stepIdx * step) % n;
        let channelIdx = pIdx;
        if (partition === 'even') channelIdx = pIdx * 2;
        else if (partition === 'odd') channelIdx = pIdx * 2 + 1;

        const pixelIdx = Math.floor(channelIdx / 3);
        const colorOffset = channelIdx % 3;
        return pixelIdx * 4 + colorOffset;
    },

    /**
     * Partisyon kanal numarasını döndürür.
     */
    getPartitionChannel(stepIdx: number, totalChannels: number, c0: number, step: number, partition: Partition = 'all'): number {
        let n = totalChannels;
        if (partition === 'even') n = Math.floor((totalChannels + 1) / 2);
        else if (partition === 'odd') n = Math.floor(totalChannels / 2);

        const pIdx = (c0 + stepIdx * step) % n;
        let channelIdx = pIdx;
        if (partition === 'even') channelIdx = pIdx * 2;
        else if (partition === 'odd') channelIdx = pIdx * 2 + 1;

        return channelIdx;
    }
};
