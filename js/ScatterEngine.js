/**
 * ScatterEngine.js (Faz 3: Bölümlü / Partitioned PRNG Dağıtıcı)
 * - $O(1)$ Bellek Tüketimli Pseudo-Random Permütasyon.
 * - Çift Katmanlı İnkâr Edilebilir Şifreleme için 'even' ve 'odd' kanal bölümlemesi.
 * - Tek katman için 'all' modu.
 */

function gcd(a, b) {
    while (b) {
        let t = b;
        b = a % b;
        a = t;
    }
    return a;
}

function findCoprime(n, preferred) {
    let step = (preferred % (n - 1)) + 1;
    while (gcd(step, n) !== 1) {
        step = (step + 1) % n;
        if (step === 0) step = 1;
    }
    return step;
}

export const ScatterEngine = {
    /**
     * HKDF 64-bit tohumundan c0, step ve nPartition parametrelerini türetir (O(1) hesaplama).
     * @param {ArrayBuffer|Uint8Array} bits64
     * @param {number} totalUsableChannels
     * @param {'all'|'even'|'odd'} [partition='all']
     * @returns {{ c0: number, step: number, nPartition: number }}
     */
    deriveParamsFromBits(bits64, totalUsableChannels, partition = 'all') {
        const view = new DataView(bits64 instanceof ArrayBuffer ? bits64 : bits64.buffer, bits64.byteOffset, 8);
        const c0Raw = view.getUint32(0, false);
        const stepRaw = view.getUint32(4, false);

        let nPartition = totalUsableChannels;
        if (partition === 'even') {
            nPartition = Math.floor((totalUsableChannels + 1) / 2);
        } else if (partition === 'odd') {
            nPartition = Math.floor(totalUsableChannels / 2);
        }

        const c0 = c0Raw % nPartition;
        const step = findCoprime(nPartition, stepRaw);
        return { c0, step, nPartition };
    },

    /**
     * Parola, toplam kanal ve bölüm türünden (all/even/odd) parametreleri türetir (Format v2 geriye uyumluluk).
     * @param {string} password
     * @param {number} totalUsableChannels
     * @param {'all'|'even'|'odd'} [partition='all']
     * @returns {Promise<{ c0: number, step: number, nPartition: number }>}
     */
    async deriveParams(password, totalUsableChannels, partition = 'all') {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits"]
        );

        const bits = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: enc.encode("StegoCrypt_PRNG_Scatter_V2"),
                iterations: 1000,
                hash: "SHA-256"
            },
            keyMaterial,
            64
        );

        const view = new DataView(bits);
        const c0Raw = view.getUint32(0, false);
        const stepRaw = view.getUint32(4, false);

        let nPartition = totalUsableChannels;
        if (partition === 'even') {
            nPartition = Math.floor((totalUsableChannels + 1) / 2);
        } else if (partition === 'odd') {
            nPartition = Math.floor(totalUsableChannels / 2);
        }

        const c0 = c0Raw % nPartition;
        const step = findCoprime(nPartition, stepRaw);

        return { c0, step, nPartition };
    },

    /**
     * Dağıtılmış adım numarasından doğrudan ImageData.data raw indeksini döndürür.
     * @param {number} stepIndex
     * @param {number} totalUsableChannels
     * @param {number} c0
     * @param {number} step
     * @param {'all'|'even'|'odd'} [partition='all']
     * @returns {number}
     */
    getPartitionRawIndex(stepIndex, totalUsableChannels, c0, step, partition = 'all') {
        let nPartition = totalUsableChannels;
        if (partition === 'even') {
            nPartition = Math.floor((totalUsableChannels + 1) / 2);
        } else if (partition === 'odd') {
            nPartition = Math.floor(totalUsableChannels / 2);
        }

        const pIdx = (c0 + stepIndex * step) % nPartition;
        let usableChannel = pIdx;

        if (partition === 'even') {
            usableChannel = pIdx * 2;
        } else if (partition === 'odd') {
            usableChannel = pIdx * 2 + 1;
        }

        const pixelIndex = Math.floor(usableChannel / 3);
        const colorOffset = usableChannel % 3;
        return pixelIndex * 4 + colorOffset;
    },

    /**
     * Geriye dönük uyumluluk için tek katman indeksi
     */
    getRawIndex(stepIndex, totalUsableChannels, c0, step) {
        return this.getPartitionRawIndex(stepIndex, totalUsableChannels, c0, step, 'all');
    }
};
