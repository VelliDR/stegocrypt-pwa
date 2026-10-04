/**
 * ZeroWidthEngine.js (Revize)
 * Bayt dizilerini sıfır genişlikli karakterlere dönüştürür ve geri okur.
 * Bellek dostu string oluşturma için dizi birleştirme kullanır.
 */
export const ZeroWidthEngine = {
    // \u200B = Bit 0 (Zero Width Space)
    // \u200C = Bit 1 (Zero Width Non‑Joiner)

    /**
     * Uint8Array → görünmez Unicode string
     * @param {Uint8Array} uint8Array
     * @returns {string}
     */
    encode(uint8Array) {
        // Önce tüm bitleri içeren bir dizi oluştur, sonra join ile string yap
        const chars = [];
        for (let i = 0; i < uint8Array.length; i++) {
            let byte = uint8Array[i];
            // Her baytın 8 bitini sırayla işle (en yüksek bitten başlayarak)
            for (let bit = 7; bit >= 0; bit--) {
                chars.push((byte >> bit) & 1 ? '\u200C' : '\u200B');
            }
        }
        return chars.join('');
    },

    /**
     * Görünmez karakterleri tarayarak Uint8Array çıkarır.
     * @param {string} text
     * @returns {Uint8Array}
     */
    extractZeroWidth(text) {
        const bits = [];
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '\u200B') {
                bits.push(0);
            } else if (char === '\u200C') {
                bits.push(1);
            }
        }

        if (bits.length === 0 || bits.length % 8 !== 0) {
            throw new Error("Metinde gizli görünmez veri bulunamadı.");
        }

        const byteLength = bits.length / 8;
        const bytes = new Uint8Array(byteLength);
        for (let i = 0; i < byteLength; i++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                byte = (byte << 1) | bits[i * 8 + bit];
            }
            bytes[i] = byte;
        }
        return bytes;
    }
};