/**
 * CryptoEngine.js - Ham Bayt Desteği Eklenmiş
 */
export const CryptoEngine = {
    async deriveKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
        );

        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    /**
     * Ham Uint8Array verisini AES-GCM ile şifreler.
     */
    async encryptBuffer(dataBuffer, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            dataBuffer
        );

        const magic = new TextEncoder().encode("STEG");
        const cipherBytes = new Uint8Array(ciphertext);
        const lenBytes = new Uint8Array(4);
        new DataView(lenBytes.buffer).setUint32(0, cipherBytes.length, false);

        const payload = new Uint8Array(4 + 4 + 16 + 12 + cipherBytes.length);
        payload.set(magic, 0);
        payload.set(lenBytes, 4);
        payload.set(salt, 8);
        payload.set(iv, 24);
        payload.set(cipherBytes, 36);

        return payload;
    },

    /**
     * Şifreli veriyi çözer ve ham Uint8Array döndürür.
     */
    async decryptBuffer(payload, password) {
        if (payload.length < 36) throw new Error("Veri paketi geçersiz.");

        const magic = new TextDecoder().decode(payload.slice(0, 4));
        if (magic !== "STEG") throw new Error("Görselde geçerli bir şifreli veri imzası bulunamadı.");

        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const cipherLen = view.getUint32(4, false);
        
        const salt = payload.slice(8, 24);
        const iv = payload.slice(24, 36);
        const ciphertext = payload.slice(36, 36 + cipherLen);

        const key = await this.deriveKey(password, salt);
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            ciphertext
        );

        return new Uint8Array(decryptedBuffer);
    }
};