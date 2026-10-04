/**
 * CryptoEngine.js (Revize - Sıfır İmza / Zero-Signature ve Dağınık Şifreleme Desteği)
 * - AES-GCM-256 simetrik şifreleme + PBKDF2 (100.000 iterasyon)
 * - Sıfır İmza: Açık metin 'STEG' başlığı kaldırılmış, 64 bayt saf entropi başlığı
 * - Erken parola doğrulama (GCM Auth Tag) ile OOM koruması
 * - Klasik sıralı paketler için geriye dönük uyumluluk
 */
export const CryptoEngine = {
    async deriveKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );

        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt,
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
     * Sıfır İmza (Zero-Signature) Paketi Üretir:
     * - Salt: 16 bayt (rastgele)
     * - IV Meta: 12 bayt (rastgele)
     * - Şifreli Meta Bloğu: 24 bayt (8 bayt meta + 16 bayt GCM auth tag)
     * - IV Body: 12 bayt (rastgele)
     * - Şifreli Gövde: ciphertext
     * Toplam Başlık = 64 bayt (Tümü saf rastgele gürültü, sıfır açık metin)
     */
    async encryptZeroSig(dataBuffer, password, lsbMode = 1) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const ivMeta = crypto.getRandomValues(new Uint8Array(12));
        const ivBody = crypto.getRandomValues(new Uint8Array(12));

        const key = await this.deriveKey(password, salt);

        // 1. Gövdeyi şifrele
        const cipherBodyBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: ivBody },
            key,
            dataBuffer
        );
        const cipherBody = new Uint8Array(cipherBodyBuffer);

        // 2. Metadata (8 bayt): [0..2]: 'SG', [2]: lsbMode, [3]: 0x00, [4..8]: cipherBody.length
        const metaPlain = new Uint8Array(8);
        metaPlain[0] = 0x53; // 'S'
        metaPlain[1] = 0x47; // 'G'
        metaPlain[2] = lsbMode;
        metaPlain[3] = 0x00;
        new DataView(metaPlain.buffer).setUint32(4, cipherBody.length, false);

        // Metadata şifrele (24 bayt)
        const encMetaBuffer = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: ivMeta },
            key,
            metaPlain
        );
        const encMeta = new Uint8Array(encMetaBuffer);

        // 3. 64 bayt başlık oluştur
        const header = new Uint8Array(64);
        header.set(salt, 0);       // 0..16
        header.set(ivMeta, 16);    // 16..28
        header.set(encMeta, 28);   // 28..52
        header.set(ivBody, 52);    // 52..64

        return { header, cipherBody, lsbMode };
    },

    /**
     * 64 baytlık Zero-Signature başlığını çözer ve doğrular.
     * Parola yanlışsa anında hata fırlatarak OOM/çökme riskini önler.
     */
    async decryptZeroSigHeader(header64, password) {
        if (header64.length < 64) throw new Error("Başlık paketi eksik.");

        const salt = header64.subarray(0, 16);
        const ivMeta = header64.subarray(16, 28);
        const encMeta = header64.subarray(28, 52);
        const ivBody = header64.subarray(52, 64);

        const key = await this.deriveKey(password, salt);

        // Metadata bloğunu çöz (yanlış parolada GCM burada doğrudan reddeder)
        let metaPlain;
        try {
            const metaBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: ivMeta },
                key,
                encMeta
            );
            metaPlain = new Uint8Array(metaBuffer);
        } catch {
            throw new Error("Parola yanlış veya bu görselde şifreli veri bulunamadı.");
        }

        if (metaPlain[0] !== 0x53 || metaPlain[1] !== 0x47) {
            throw new Error("Geçersiz veri paketi.");
        }

        const lsbMode = metaPlain[2];
        const cipherLen = new DataView(metaPlain.buffer, metaPlain.byteOffset, 8).getUint32(4, false);

        return { key, ivBody, lsbMode, cipherLen };
    },

    /**
     * Gövde şifresini çözer.
     */
    async decryptZeroSigBody(cipherBody, key, ivBody) {
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBody },
            key,
            cipherBody
        );
        return new Uint8Array(decrypted);
    },

    // ---------- Klasik Sıralı Paketler İçin Geriye Dönük Uyumluluk ----------
    async encryptBuffer(dataBuffer, password, lsbMode = 1) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);

        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            dataBuffer
        );

        const magicStr = lsbMode === 2 ? "STG2" : "STG1";
        const magic = new TextEncoder().encode(magicStr);
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

    async decryptBuffer(payload, password) {
        if (payload.length < 36) throw new Error("Veri paketi geçersiz.");

        const magic = new TextDecoder().decode(payload.subarray(0, 4));
        if (magic !== "STEG" && magic !== "STG1" && magic !== "STG2") {
            throw new Error("Görselde veya metinde geçerli bir şifreli veri imzası bulunamadı.");
        }

        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const cipherLen = view.getUint32(4, false);

        if (payload.length < 36 + cipherLen) {
            throw new Error("Veri paketi eksik veya bozulmuş.");
        }

        const salt = payload.subarray(8, 24);
        const iv = payload.subarray(24, 36);
        const ciphertext = payload.subarray(36, 36 + cipherLen);

        const key = await this.deriveKey(password, salt);
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            ciphertext
        );

        return new Uint8Array(decryptedBuffer);
    }
};