/**
 * CompressionEngine.js
 * Web standart CompressionStream ve DecompressionStream API'leri ile
 * şifreleme öncesi sıkıştırma ve çözme sonrası açma motoru.
 * Bellek güvenliği (Decompression Bomb koruması) içerir.
 */
export const CompressionEngine = {
    /**
     * Ham Uint8Array verisini Deflate algoritmasıyla sıkıştırır.
     * @param {Uint8Array} data
     * @returns {Promise<Uint8Array>}
     */
    async compress(data) {
        if (!('CompressionStream' in globalThis)) return data;
        const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
        const response = new Response(stream);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    },

    /**
     * Sıkıştırılmış Uint8Array verisini açar.
     * @param {Uint8Array} compressedData
     * @param {number} [maxBytes=52428800] - 50 MB güvenlik sınırı
     * @returns {Promise<Uint8Array>}
     */
    async decompress(compressedData, maxBytes = 50 * 1024 * 1024) {
        if (!('DecompressionStream' in globalThis)) return compressedData;
        try {
            const stream = new Blob([compressedData]).stream().pipeThrough(new DecompressionStream('deflate'));
            const response = new Response(stream);
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength > maxBytes) {
                throw new Error("Açılan veri boyutu güvenlik sınırını aşıyor (Olası sıkıştırma bombası).");
            }
            return new Uint8Array(buffer);
        } catch (err) {
            if (err.message.includes("güvenlik sınırını aşıyor")) throw err;
            throw new Error("Sıkıştırılmış veri açılamadı veya bozulmuş.");
        }
    }
};
