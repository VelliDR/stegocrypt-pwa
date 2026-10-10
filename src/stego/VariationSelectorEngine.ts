/**
 * src/stego/VariationSelectorEngine.ts
 * Unicode Variation Selector (VS1–VS16 / U+FE00–U+FE0F) Tabanlı
 * Sosyal Medya ve Filtre Dirençli Emoji Steganografi Motoru.
 * 
 * Sosyal medya ve mesajlaşma filtreleri (X, WhatsApp, Telegram, Discord vb.)
 * sıfır genişlikli karakterleri (ZWSP/ZWNJ) çoğunlukla temizlerken,
 * emojilerin glif/renk sunumunu belirleyen Variation Selector'ları silmez.
 * 
 * Çift VS Magic Header (VS1+VS2) ve 16-bit uzunluk başlığı kullanarak
 * taşıyıcı metindeki diğer emojilerin doğal varyasyon seçicileriyle (VS16 / \uFE0F)
 * çakışmayı %100 önler.
 */

const VS_BASE = 0xFE00; // VS1 (U+FE00) .. VS16 (U+FE0F)
const VS_MAGIC_START = '\uFE00\uFE01'; // VS1, VS2 (Doğal metinlerde asla ardışık bulunmaz)

export const VariationSelectorEngine = {
    /**
     * Bayt dizisini 4-bitlik (nibble) dilimler halinde VS1-VS16 seçicilerine kodlar.
     * @param payload Gizlenecek ikili veri (Uint8Array)
     * @param carrier Taşıyıcı emoji veya metin (varsayılan: 🛡️)
     */
    encode(payload: Uint8Array, carrier: string = '🛡️'): string {
        let vsSequence = VS_MAGIC_START;
        const len = payload.length;

        // 16-bit Big-Endian uzunluk başlığı (4 nibble)
        const lenNibbles = [
            (len >> 12) & 0x0F,
            (len >> 8) & 0x0F,
            (len >> 4) & 0x0F,
            len & 0x0F
        ];

        for (const n of lenNibbles) {
            vsSequence += String.fromCharCode(VS_BASE + n);
        }

        // Yük baytlarını 2 nibble olarak kodla
        for (let i = 0; i < payload.length; i++) {
            const byte = payload[i]!;
            const highNibble = (byte >> 4) & 0x0F;
            const lowNibble = byte & 0x0F;

            vsSequence += String.fromCharCode(VS_BASE + highNibble);
            vsSequence += String.fromCharCode(VS_BASE + lowNibble);
        }

        return `${carrier}${vsSequence}`;
    },

    /**
     * Metin içindeki VS1-VS16 seçicilerini ayıklar ve ham bayt dizisini yeniden oluşturur.
     * @param text Taşıyıcı emoji ve gizli varyasyon seçicilerini içeren metin
     */
    extract(text: string): Uint8Array {
        const magicIdx = text.indexOf(VS_MAGIC_START);
        if (magicIdx === -1) {
            throw new Error("Metinde geçerli Variation Selector (VS1-VS16) gizli verisi bulunamadı.");
        }

        const stream = text.slice(magicIdx + VS_MAGIC_START.length);
        const nibbles: number[] = [];

        for (const char of stream) {
            const code = char.codePointAt(0);
            if (code !== undefined && code >= 0xFE00 && code <= 0xFE0F) {
                nibbles.push(code - VS_BASE);
            } else {
                break; // Kesintisiz varyasyon dizisi sonlandı
            }
        }

        if (nibbles.length < 4) {
            throw new Error("Bozuk veri: Variation Selector başlığı eksik.");
        }

        const len = (nibbles[0]! << 12) | (nibbles[1]! << 8) | (nibbles[2]! << 4) | nibbles[3]!;
        const expectedNibbles = 4 + len * 2;

        if (nibbles.length < expectedNibbles) {
            throw new Error("Bozuk veri: Variation Selector yükü eksik.");
        }

        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            const high = nibbles[4 + i * 2]!;
            const low = nibbles[4 + i * 2 + 1]!;
            bytes[i] = (high << 4) | low;
        }

        return bytes;
    },

    /**
     * Düz metni UTF-8 baytlarına çevirip emoji arkasına kodlar.
     */
    encodeString(secretText: string, carrier: string = '🛡️'): string {
        const bytes = new TextEncoder().encode(secretText);
        return this.encode(bytes, carrier);
    },

    /**
     * Metinden Variation Selector verisini ayıklayıp UTF-8 metin olarak çözer.
     */
    decodeString(text: string): string {
        const bytes = this.extract(text);
        return new TextDecoder('utf-8').decode(bytes);
    },

    /**
     * Verilen metinde Variation Selector steganografi paketi bulunup bulunmadığını kontrol eder.
     */
    hasVariationSelectors(text: string): boolean {
        return text.includes(VS_MAGIC_START);
    }
};
