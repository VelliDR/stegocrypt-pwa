import { describe, it, expect } from 'vitest';
import { CryptoEngine } from '../../src/crypto/CryptoEngine.ts';
import { KeyDerivation } from '../../src/crypto/KeyDerivation.ts';

describe('CryptoEngine & KeyDerivation', () => {
    it('Classic AES-GCM buffer roundtrip', async () => {
        const plain = new TextEncoder().encode('StegoCrypt TypeScript Crypto Test');
        const pass = 'SecretKey123';
        const enc = await CryptoEngine.encryptBuffer(plain, pass, 1);
        const dec = await CryptoEngine.decryptBuffer(enc, pass);
        expect(new TextDecoder().decode(dec)).toBe('StegoCrypt TypeScript Crypto Test');
    });

    it('Classic buffer decryption fails with wrong password', async () => {
        const plain = new TextEncoder().encode('Test Data');
        const enc = await CryptoEngine.encryptBuffer(plain, 'CorrectPass', 1);
        await expect(CryptoEngine.decryptBuffer(enc, 'WrongPass')).rejects.toThrow();
    });

    it('Format v3 Single Master KDF (600k) + HKDF subkeys roundtrip', async () => {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const masterKey = await KeyDerivation.deriveMasterKeyV3('V3MasterPass', salt, 1000); // 1000 iterasyon hızlı test
        const subkeysAll = await KeyDerivation.deriveSubkeysV3(masterKey, 'v3/all');

        expect(subkeysAll.scatterBits.byteLength).toBe(32);
        expect(subkeysAll.metaKey).toBeDefined();
        expect(subkeysAll.bodyKey).toBeDefined();

        const plain = new TextEncoder().encode('Format v3 Test Message');
        const enc = await CryptoEngine.encryptV3(plain, subkeysAll.metaKey as CryptoKey, subkeysAll.bodyKey as CryptoKey, 1);

        expect(enc.header48.length).toBe(48);

        const meta = await CryptoEngine.decryptMetaV3(enc.header48, subkeysAll.metaKey as CryptoKey);
        expect(meta.lsbMode).toBe(1);
        expect(meta.cipherLen).toBe(enc.cipherBody.length);

        const decBody = await CryptoEngine.decryptBodyV3(enc.cipherBody, subkeysAll.bodyKey as CryptoKey, meta.ivBody);
        expect(new TextDecoder().decode(decBody)).toBe('Format v3 Test Message');
    });

    it('ChaCha20-Poly1305 alternative cipher encrypt/decrypt roundtrip', () => {
        const key = crypto.getRandomValues(new Uint8Array(32));
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const plain = new TextEncoder().encode('ChaCha20-Poly1305 High Performance Test');

        const ciphertext = CryptoEngine.encryptChaCha(plain, key, nonce);
        expect(ciphertext.length).toBe(plain.length + 16); // 16-byte Poly1305 auth tag

        const decrypted = CryptoEngine.decryptChaCha(ciphertext, key, nonce);
        expect(new TextDecoder().decode(decrypted)).toBe('ChaCha20-Poly1305 High Performance Test');
    });
});
