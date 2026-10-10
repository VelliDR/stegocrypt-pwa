/**
 * src/crypto/KeyDerivation.ts
 * KDF ve HKDF Alt-Anahtar Türetim Motoru.
 * - PBKDF2-SHA256 (600.000 iterasyon) ile Master Key türetimi.
 * - HKDF-SHA256 ile ayrık katman alt-anahtarları ('v3/all', 'v3/even', 'v3/odd') üretimi.
 */

import type { SubkeysV3, Partition } from '../types/index.ts';

export const KeyDerivation = {
    /**
     * PBKDF2-SHA256 ile Master Key türetir.
     * @param password Açık metin parola
     * @param salt 16 baytlık tuz
     * @param iterations PBKDF2 döngü sayısı (varsayılan: 600.000)
     */
    async deriveMasterKeyV3(
        password: string,
        salt: Uint8Array,
        iterations: number = 600000
    ): Promise<CryptoKey> {
        const pwBytes = new TextEncoder().encode(password);
        try {
            const baseKey = await crypto.subtle.importKey(
                'raw',
                pwBytes,
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            const masterBits = await crypto.subtle.deriveBits(
                {
                    name: 'PBKDF2',
                    salt: salt as BufferSource,
                    iterations,
                    hash: 'SHA-256'
                },
                baseKey,
                256
            );

            const masterKey = await crypto.subtle.importKey(
                'raw',
                masterBits,
                'HKDF',
                false,
                ['deriveBits', 'deriveKey']
            );

            // Best-effort memory zeroization: Geçici masterBits tamponunu anında sıfırla
            new Uint8Array(masterBits).fill(0);
            return masterKey;
        } finally {
            pwBytes.fill(0);
        }
    },

    /**
     * Argon2id (Bellek-Zorlu SIMD Wasm) ile Master Key türetir.
     * Ham türetilmiş anahtar bellekten anında sıfırlanır (.fill(0)).
     */
    async deriveMasterKeyArgon2id(
        password: string,
        salt: Uint8Array,
        options?: import('./Argon2Engine.ts').Argon2Options
    ): Promise<CryptoKey> {
        const { Argon2Engine } = await import('./Argon2Engine.ts');
        const rawKey = await Argon2Engine.deriveKey(password, salt, options);
        try {
            return await crypto.subtle.importKey(
                'raw',
                rawKey as BufferSource,
                'HKDF',
                false,
                ['deriveBits', 'deriveKey']
            );
        } finally {
            rawKey.fill(0);
        }
    },

    /**
     * HKDF-SHA256 ile belirtilen etiket için alt anahtarları türetir.
     * @param masterKey CryptoKey (HKDF)
     * @param infoLabel 'v3/all' | 'v3/even' | 'v3/odd'
     */
    async deriveSubkeysV3(
        masterKey: CryptoKey,
        infoLabel: `v3/${Partition}`
    ): Promise<SubkeysV3> {
        const infoBytes = new TextEncoder().encode(infoLabel);

        // 1. ScatterEngine için 32 baytlık PRNG tohumu
        const scatterBits = await crypto.subtle.deriveBits(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: new Uint8Array(0) as BufferSource,
                info: new Uint8Array([...infoBytes, 0x01]) as BufferSource
            },
            masterKey,
            256
        );

        // 2. 48 baytlık başlık için AES-256-GCM anahtarı
        const metaKey = await crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: new Uint8Array(0) as BufferSource,
                info: new Uint8Array([...infoBytes, 0x02]) as BufferSource
            },
            masterKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        // 3. Gövde yükü için AES-256-GCM anahtarı
        const bodyKey = await crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: new Uint8Array(0) as BufferSource,
                info: new Uint8Array([...infoBytes, 0x03]) as BufferSource
            },
            masterKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        return { scatterBits, metaKey, bodyKey };
    }
};
