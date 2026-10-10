/**
 * src/stego/ZeroWidthEngine.ts
 * Görünmez Metin (Zero-Width Steganography) ve Unicode Düzlem 14 ASCII Smuggling Motoru.
 */

const ZW_ZERO = '\u200B'; // Zero-Width Space (Bit 0)
const ZW_ONE = '\u200C';  // Zero-Width Non-Joiner (Bit 1)
const ZW_SEP = '\u200D';  // Zero-Width Joiner (Bayt Ayracı / Belirteç)

export const ZeroWidthEngine = {
    /**
     * Bayt dizisini görünmez sıfır-genişlikli karakterlere kodlar.
     */
    encode(payload: Uint8Array): string {
        let invisible = '';
        for (let i = 0; i < payload.length; i++) {
            const b = payload[i]!;
            for (let bit = 7; bit >= 0; bit--) {
                const bitVal = (b >> bit) & 1;
                invisible += bitVal === 1 ? ZW_ONE : ZW_ZERO;
            }
            invisible += ZW_SEP;
        }
        return invisible;
    },

    /**
     * Görünmez karakterlerden bayt dizisini çıkarır.
     */
    extractZeroWidth(text: string): Uint8Array {
        const bits: number[] = [];
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === ZW_ZERO) {
                bits.push(0);
            } else if (ch === ZW_ONE) {
                bits.push(1);
            }
        }

        if (bits.length === 0) {
            throw new Error("Metinde görünmez şifreli karakter bulunamadı.");
        }

        if (bits.length % 8 !== 0) {
            throw new Error("Bozuk görünmez veri (bit sayısı 8'in katı değil).");
        }

        const bytes = new Uint8Array(bits.length / 8);
        for (let b = 0; b < bytes.length; b++) {
            let byteVal = 0;
            for (let bit = 0; bit < 8; bit++) {
                byteVal = (byteVal << 1) | (bits[b * 8 + bit] ?? 0);
            }
            bytes[b] = byteVal;
        }

        return bytes;
    },

    /**
     * Unicode Düzlem 14 (U+E0000 - U+E007F) Tag tabanlı ASCII Smuggling kodlayıcısı.
     */
    encodePlane14(asciiText: string): string {
        let smuggled = '';
        for (let i = 0; i < asciiText.length; i++) {
            const code = asciiText.charCodeAt(i);
            if (code >= 0x20 && code <= 0x7E) {
                smuggled += String.fromCodePoint(0xE0000 + code);
            }
        }
        return smuggled;
    },

    /**
     * Unicode Düzlem 14 Tag tabanlı ASCII Smuggling çözücüsü.
     */
    decodePlane14(text: string): string {
        let result = '';
        for (const char of text) {
            const cp = char.codePointAt(0);
            if (cp !== undefined && cp >= 0xE0020 && cp <= 0xE007E) {
                result += String.fromCharCode(cp - 0xE0000);
            }
        }
        return result;
    }
};
