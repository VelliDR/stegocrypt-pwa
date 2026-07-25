/**
 * StegoEngine.js
 * Canvas piksellerinin LSB (Least Significant Bit) katmanına veri gömme ve okuma motoru.
 */

export const StegoEngine = {
    embed(imageData, payload) {
        const data = imageData.data;
        const maxBytes = Math.floor((data.length / 4) * 3 / 8);

        if (payload.length > maxBytes) {
            throw new Error(`Veri boyutu görsel kapasitesini aşıyor (Maks: ${maxBytes} bayt).`);
        }

        let byteIdx = 0;
        let bitIdx = 0;

        for (let i = 0; i < data.length && byteIdx < payload.length; i++) {
            if ((i + 1) % 4 === 0) continue; // Alpha kanalını atla

            const bit = (payload[byteIdx] >> (7 - bitIdx)) & 1;
            data[i] = (data[i] & 0xFE) | bit;

            bitIdx++;
            if (bitIdx === 8) {
                bitIdx = 0;
                byteIdx++;
            }
        }

        return imageData;
    },

    extract(imageData) {
        const data = imageData.data;

        let bitIdx = 0;
        let currentByte = 0;

        // 1. AŞAMA: İlk 36 baytlık başlığı (STEG + LEN + SALT + IV) oku
        const header = new Uint8Array(36);
        let headerIdx = 0;
        let i = 0;

        for (; i < data.length && headerIdx < 36; i++) {
            if ((i + 1) % 4 === 0) continue;

            const bit = data[i] & 1;
            currentByte = (currentByte << 1) | bit;
            bitIdx++;

            if (bitIdx === 8) {
                header[headerIdx++] = currentByte;
                currentByte = 0;
                bitIdx = 0;
            }
        }

        if (headerIdx < 36) {
            throw new Error("Görsel veri okumak için çok küçük.");
        }

        // Başlık İmzası Kontrolü (STEG)
        const magic = new TextDecoder().decode(header.slice(0, 4));
        if (magic !== "STEG") {
            throw new Error("Bu görselde şifreli veri bulunamadı (Resim JPG yapılmış veya bozulmuş olabilir).");
        }

        // Şifreli Veri Uzunluğunu Okuma
        const view = new DataView(header.buffer);
        const cipherLen = view.getUint32(4, false);
        const totalLen = 36 + cipherLen;

        // 2. AŞAMA: Kalan şifreli gövdeyi oku (Kaldığı 'i' pikselinden devam ederek)
        const payload = new Uint8Array(totalLen);
        payload.set(header, 0);

        let payloadIdx = 36;
        for (; i < data.length && payloadIdx < totalLen; i++) {
            if ((i + 1) % 4 === 0) continue;

            const bit = data[i] & 1;
            currentByte = (currentByte << 1) | bit;
            bitIdx++;

            if (bitIdx === 8) {
                payload[payloadIdx++] = currentByte;
                currentByte = 0;
                bitIdx = 0;
            }
        }

        if (payloadIdx < totalLen) {
            throw new Error("Eksik veri: Görsel kırpılmış veya boyutu değiştirilmiş.");
        }

        return payload;
    }
};