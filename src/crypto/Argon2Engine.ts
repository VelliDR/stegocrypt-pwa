/**
 * src/crypto/Argon2Engine.ts
 * hash-wasm tabanlı yüksek performanslı WebAssembly Argon2id KDF motoru.
 * GPU kaba kuvvet (brute-force) ve ASIC saldırılarına karşı bellek-zorlu (memory-hard) koruma sağlar.
 */

import { argon2id } from 'hash-wasm';

export interface Argon2Options {
    iterations?: number;      // Zaman maliyeti (varsayılan: 3)
    memorySizeKB?: number;    // Bellek maliyeti (varsayılan: 65536 KB = 64 MB)
    parallelism?: number;     // İş parçacığı sayısı (varsayılan: 1)
    hashLength?: number;      // Üretilecek anahtar uzunluğu bayt cinsinden (varsayılan: 32)
}

export const Argon2Engine = {
    /**
     * Argon2id kullanarak paroladan ve tuzdan kriptografik anahtar türetir.
     * @param password Açık metin parola
     * @param salt En az 16 baytlık kriptografik tuz
     * @param options Argon2id parametreleri
     * @returns 32 baytlık türetilmiş anahtar (Uint8Array)
     */
    async deriveKey(
        password: string,
        salt: Uint8Array,
        options: Argon2Options = {}
    ): Promise<Uint8Array> {
        const timeCost = options.iterations ?? 3;
        const memoryCost = options.memorySizeKB ?? 65536; // 64 MB
        const parallelism = options.parallelism ?? 1;
        const hashLength = options.hashLength ?? 32;

        try {
            const rawHash = await argon2id({
                password,
                salt,
                parallelism,
                iterations: timeCost,
                memorySize: memoryCost,
                hashLength,
                outputType: 'binary'
            });

            return new Uint8Array(rawHash);
        } catch (err) {
            console.warn("Argon2id Wasm çalıştırma hatası, fallback devrede:", err);
            throw err;
        }
    },

    /**
     * Wasm ortamının çalışabilirliğini test eder.
     */
    async isSupported(): Promise<boolean> {
        try {
            const testSalt = new Uint8Array(16);
            await argon2id({
                password: 'test',
                salt: testSalt,
                parallelism: 1,
                iterations: 1,
                memorySize: 1024,
                hashLength: 16,
                outputType: 'binary'
            });
            return true;
        } catch {
            return false;
        }
    }
};
