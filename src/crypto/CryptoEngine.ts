/**
 * src/crypto/CryptoEngine.ts
 * Kimlik Doğrulamalı Şifreleme (AES-256-GCM & ChaCha20-Poly1305) ve Başlık Yönetimi.
 * Format v3, Format v2 (ZeroSig) ve Format v1 desteği sunar.
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import type { LsbMode, EncryptedPackageV3, ZeroSigHeaderResult } from '../types/index.ts';

export const CryptoEngine = {
    /**
     * PBKDF2-SHA256 ile AES-256-GCM için CryptoKey türetir.
     */
    async deriveKey(password: string, salt: Uint8Array, iterations: number = 100000): Promise<CryptoKey> {
        const pwBytes = new TextEncoder().encode(password);
        try {
            const baseKey = await crypto.subtle.importKey(
                'raw',
                pwBytes,
                'PBKDF2',
                false,
                ['deriveKey']
            );

            return await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt as BufferSource,
                    iterations,
                    hash: 'SHA-256'
                },
                baseKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        } finally {
            pwBytes.fill(0);
        }
    },

    // =========================================================================
    // FORMAT v3: Public Salt + HKDF 48-Bayt Başlık & Gövde Şifreleme
    // =========================================================================

    /**
     * Format v3 için 48 baytlık başlık ve gövdeyi şifreler.
     * @param dataBytes Şifrelenecek ham veri
     * @param metaKey Başlık için türetilmiş AES-GCM CryptoKey
     * @param bodyKey Gövde için türetilmiş AES-GCM CryptoKey
     * @param lsbMode 1 veya 2 LSB
     * @param kdfId 0x01 (PBKDF2) veya 0x02 (Argon2id)
     */
    async encryptV3(
        dataBytes: Uint8Array,
        metaKey: CryptoKey,
        bodyKey: CryptoKey,
        lsbMode: LsbMode = 1,
        kdfId: number = 0x01
    ): Promise<EncryptedPackageV3> {
        // 1. Gövde için rastgele 12 bayt IV üret ve şifrele
        const ivBody = crypto.getRandomValues(new Uint8Array(12));
        const bodyBuf = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: ivBody as BufferSource },
            bodyKey,
            dataBytes as BufferSource
        );
        const cipherBody = new Uint8Array(bodyBuf);

        // 2. 20 baytlık açık meta bloğu oluştur
        const rawMeta = new Uint8Array(20);
        const metaView = new DataView(rawMeta.buffer);
        rawMeta[0] = lsbMode;             // 1 bayt: LSB Modu (1 veya 2)
        rawMeta[1] = kdfId;               // 1 bayt: KDF Türü (0x01: PBKDF2 600k, 0x02: Argon2id)
        rawMeta[2] = 0x01;                // 1 bayt: Şifre Türü (0x01: AES-GCM, 0x02: ChaCha20-Poly1305)
        rawMeta[3] = 0x00;                // 1 bayt: Rezerve
        metaView.setUint32(4, cipherBody.length, false); // 4 bayt: Şifreli gövde uzunluğu (Big-Endian)
        rawMeta.set(ivBody, 8);           // 12 bayt: Gövde IV

        // 3. 20 baytlık metayı 12 baytlık rastgele IV ile şifrele (Çıktı: 20 bayt + 16 bayt auth tag = 36 bayt)
        const ivMeta = crypto.getRandomValues(new Uint8Array(12));
        const metaCipherBuf = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: ivMeta as BufferSource },
            metaKey,
            rawMeta as BufferSource
        );
        const cipherMetaWithTag = new Uint8Array(metaCipherBuf);

        // 4. Toplam 48 baytlık başlık: 12 bayt ivMeta + 36 bayt cipherMetaWithTag
        const header48 = new Uint8Array(48);
        header48.set(ivMeta, 0);
        header48.set(cipherMetaWithTag, 12);

        rawMeta.fill(0);
        return { header48, cipherBody };
    },

    /**
     * Format v3 48-baytlık başlığı çözer ve doğrular.
     */
    async decryptMetaV3(
        header48: Uint8Array,
        metaKey: CryptoKey
    ): Promise<{ lsbMode: LsbMode; cipherLen: number; ivBody: Uint8Array; kdfId: number }> {
        if (header48.length < 48) {
            throw new Error("Geçersiz Format v3 başlık uzunluğu.");
        }

        const ivMeta = header48.subarray(0, 12);
        const cipherMetaWithTag = header48.subarray(12, 48);

        const decryptedMetaBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivMeta as BufferSource },
            metaKey,
            cipherMetaWithTag as BufferSource
        );
        const rawMeta = new Uint8Array(decryptedMetaBuf);
        const metaView = new DataView(rawMeta.buffer);

        const lsbMode = (rawMeta[0] === 2 ? 2 : 1) as LsbMode;
        const kdfId = rawMeta[1];
        const cipherLen = metaView.getUint32(4, false);
        const ivBody = new Uint8Array(rawMeta.subarray(8, 20));

        rawMeta.fill(0);
        return { lsbMode, cipherLen, ivBody, kdfId };
    },

    /**
     * Format v3 gövdesini çözer.
     */
    async decryptBodyV3(
        cipherBody: Uint8Array,
        bodyKey: CryptoKey,
        ivBody: Uint8Array
    ): Promise<Uint8Array> {
        const plainBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBody as BufferSource },
            bodyKey,
            cipherBody as BufferSource
        );
        return new Uint8Array(plainBuf);
    },

    // =========================================================================
    // ChaCha20-Poly1305 Alternatif AEAD Motoru (@noble/ciphers)
    // =========================================================================

    /**
     * ChaCha20-Poly1305 ile bağımsız şifreleme yapar.
     */
    encryptChaCha(data: Uint8Array, key32: Uint8Array, nonce12: Uint8Array): Uint8Array {
        const chacha = chacha20poly1305(key32, nonce12);
        return chacha.encrypt(data);
    },

    /**
     * ChaCha20-Poly1305 ile bağımsız şifre çözer.
     */
    decryptChaCha(ciphertext: Uint8Array, key32: Uint8Array, nonce12: Uint8Array): Uint8Array {
        const chacha = chacha20poly1305(key32, nonce12);
        return chacha.decrypt(ciphertext);
    },

    // =========================================================================
    // FORMAT v2: Zero-Signature 64-Bayt Başlık & Gövde Şifreleme
    // =========================================================================

    async encryptZeroSig(
        dataBytes: Uint8Array,
        password: string,
        lsbMode: LsbMode = 1
    ): Promise<{ header: Uint8Array; cipherBody: Uint8Array }> {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await this.deriveKey(password, salt, 100000);

        const ivBody = crypto.getRandomValues(new Uint8Array(12));
        const bodyBuf = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: ivBody as BufferSource },
            key,
            dataBytes as BufferSource
        );
        const cipherBody = new Uint8Array(bodyBuf);

        const rawMeta = new Uint8Array(20);
        const view = new DataView(rawMeta.buffer);
        rawMeta[0] = lsbMode;
        rawMeta[1] = 0;
        rawMeta[2] = 0;
        rawMeta[3] = 0;
        view.setUint32(4, cipherBody.length, false);
        rawMeta.set(ivBody, 8);

        const ivHeader = crypto.getRandomValues(new Uint8Array(12));
        const metaCipherBuf = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: ivHeader as BufferSource },
            key,
            rawMeta as BufferSource
        );
        const metaCipherWithTag = new Uint8Array(metaCipherBuf);

        const header64 = new Uint8Array(64);
        header64.set(salt, 0);
        header64.set(ivHeader, 16);
        header64.set(metaCipherWithTag, 28);

        rawMeta.fill(0);
        return { header: header64, cipherBody };
    },

    async decryptZeroSigHeader(header64: Uint8Array, password: string): Promise<ZeroSigHeaderResult> {
        if (header64.length < 64) throw new Error("Geçersiz başlık uzunluğu.");
        const salt = header64.subarray(0, 16);
        const ivHeader = header64.subarray(16, 28);
        const metaCipherWithTag = header64.subarray(28, 64);

        const key = await this.deriveKey(password, salt, 100000);
        const metaPlainBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivHeader as BufferSource },
            key,
            metaCipherWithTag as BufferSource
        );
        const rawMeta = new Uint8Array(metaPlainBuf);
        const view = new DataView(rawMeta.buffer);

        const lsbMode = rawMeta[0];
        const cipherLen = view.getUint32(4, false);
        const ivBody = new Uint8Array(rawMeta.subarray(8, 20));

        rawMeta.fill(0);
        return { key, ivBody, lsbMode, cipherLen };
    },

    async decryptZeroSigBody(
        cipherBody: Uint8Array,
        key: CryptoKey,
        ivBody: Uint8Array
    ): Promise<Uint8Array> {
        const plainBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBody as BufferSource },
            key,
            cipherBody as BufferSource
        );
        return new Uint8Array(plainBuf);
    },

    // =========================================================================
    // FORMAT v1: Sıralı Klasik Format (STG1, STG2, STEG)
    // =========================================================================

    async encryptBuffer(dataBytes: Uint8Array, password: string, lsbMode: LsbMode = 1): Promise<Uint8Array> {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt, 100000);

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as BufferSource },
            key,
            dataBytes as BufferSource
        );

        const magic = lsbMode === 2 ? 'STG2' : 'STG1';
        const magicBytes = new TextEncoder().encode(magic);
        const cipherBytes = new Uint8Array(encrypted);

        const payload = new Uint8Array(36 + cipherBytes.length);
        const view = new DataView(payload.buffer);

        payload.set(magicBytes, 0);
        view.setUint32(4, cipherBytes.length, false);
        payload.set(salt, 8);
        payload.set(iv, 24);
        payload.set(cipherBytes, 36);

        return payload;
    },

    async decryptBuffer(payload: Uint8Array, password: string): Promise<Uint8Array> {
        if (payload.length < 36) {
            throw new Error("Paket çok kısa.");
        }

        const magic = new TextDecoder().decode(payload.subarray(0, 4));
        if (magic !== 'STG1' && magic !== 'STG2' && magic !== 'STEG') {
            throw new Error("Geçersiz veya tanınmayan StegoCrypt paketi.");
        }

        const view = new DataView(payload.buffer, payload.byteOffset, 36);
        const cipherLen = view.getUint32(4, false);

        if (payload.length < 36 + cipherLen) {
            throw new Error("Veri paketi eksik veya kırpılmış.");
        }

        const salt = payload.subarray(8, 24);
        const iv = payload.subarray(24, 36);
        const ciphertext = payload.subarray(36, 36 + cipherLen);

        const key = await this.deriveKey(password, salt, 100000);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv as BufferSource },
            key,
            ciphertext as BufferSource
        );

        return new Uint8Array(decrypted);
    }
};
