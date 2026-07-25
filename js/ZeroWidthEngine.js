/**
 * js/ZeroWidthEngine.js
 * Şifreli bayt dizisini görünmez Unicode karakterlerine dönüştürme ve çıkarma motoru.
 */
export const ZeroWidthEngine = {
    // \u200B = Bit 0 (Zero Width Space)
    // \u200C = Bit 1 (Zero Width Non-Joiner)

    encode(uint8Array) {
        let binaryStr = "";
        for (let i = 0; i < uint8Array.length; i++) {
            binaryStr += uint8Array[i].toString(2).padStart(8, '0');
        }

        let zeroWidthStr = "";
        for (let i = 0; i < binaryStr.length; i++) {
            zeroWidthStr += binaryStr[i] === '0' ? '\u200B' : '\u200C';
        }

        return zeroWidthStr;
    },

    extractZeroWidth(text) {
        let binaryStr = "";
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '\u200B') binaryStr += '0';
            else if (char === '\u200C') binaryStr += '1';
        }

        if (binaryStr.length === 0 || binaryStr.length % 8 !== 0) {
            throw new Error("Metinde gizli görünmez veri bulunamadı.");
        }

        const bytes = new Uint8Array(binaryStr.length / 8);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(binaryStr.substr(i * 8, 8), 2);
        }

        return bytes;
    }
};