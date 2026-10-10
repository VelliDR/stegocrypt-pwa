import { describe, it, expect } from 'vitest';
import { Argon2Engine } from '../../src/crypto/Argon2Engine.ts';

describe('Argon2Engine Wasm', () => {
    it('Argon2id Wasm environment is supported', async () => {
        const supported = await Argon2Engine.isSupported();
        expect(supported).toBe(true);
    });

    it('Argon2id key derivation produces deterministic 32-byte hash', async () => {
        const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        const key1 = await Argon2Engine.deriveKey('Argon2TestPassword', salt, {
            iterations: 1,
            memorySizeKB: 1024,
            parallelism: 1,
            hashLength: 32
        });

        const key2 = await Argon2Engine.deriveKey('Argon2TestPassword', salt, {
            iterations: 1,
            memorySizeKB: 1024,
            parallelism: 1,
            hashLength: 32
        });

        expect(key1.length).toBe(32);
        expect(key2.length).toBe(32);
        expect(key1).toEqual(key2);
    });

    it('KeyDerivation.deriveMasterKeyArgon2id derives HKDF CryptoKey and subkeys', async () => {
        const { KeyDerivation } = await import('../../src/crypto/KeyDerivation.ts');
        const salt = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160]);
        const masterKey = await KeyDerivation.deriveMasterKeyArgon2id('Argon2HKDFPass_2026', salt, {
            iterations: 1,
            memorySizeKB: 1024,
            parallelism: 1
        });

        expect(masterKey).toBeDefined();
        expect(masterKey.algorithm.name).toBe('HKDF');

        const subkeys = await KeyDerivation.deriveSubkeysV3(masterKey, 'v3/all');
        expect(subkeys.scatterBits.byteLength).toBe(32);
        expect((subkeys.metaKey as CryptoKey).algorithm.name).toBe('AES-GCM');
        expect((subkeys.bodyKey as CryptoKey).algorithm.name).toBe('AES-GCM');
    });
});
