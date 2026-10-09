import test from 'node:test';
import assert from 'node:assert/strict';
import { CryptoEngine } from '../../js/CryptoEngine.js';

test('CryptoEngine - Classic AES-GCM buffer encryption/decryption roundtrip', async () => {
    const message = 'Gizli mesaj: Test 123! Türkçe karakterler: çğışöü';
    const plainBytes = new TextEncoder().encode(message);
    const password = 'SuperSecretPassword#2026';

    const encrypted = await CryptoEngine.encryptBuffer(plainBytes, password);
    assert.ok(encrypted.length > plainBytes.length, 'Encrypted buffer must be larger than plaintext');

    const decrypted = await CryptoEngine.decryptBuffer(encrypted, password);
    const decryptedText = new TextDecoder().decode(decrypted);
    assert.strictEqual(decryptedText, message);
});

test('CryptoEngine - Classic buffer decryption fails with wrong password', async () => {
    const plainBytes = new TextEncoder().encode('Gizli veri');
    const password = 'CorrectPassword1';
    const wrongPassword = 'WrongPassword2';

    const encrypted = await CryptoEngine.encryptBuffer(plainBytes, password);
    await assert.rejects(
        () => CryptoEngine.decryptBuffer(encrypted, wrongPassword),
        /Parola yanlış|bozuk/i
    );
});

test('CryptoEngine - Classic buffer tampering fails authentication', async () => {
    const plainBytes = new TextEncoder().encode('Kritik veri');
    const password = 'Pass';
    const encrypted = await CryptoEngine.encryptBuffer(plainBytes, password);

    // Tamper with ciphertext payload
    encrypted[encrypted.length - 1] ^= 0x01;

    await assert.rejects(
        () => CryptoEngine.decryptBuffer(encrypted, password),
        /Parola yanlış|bozuk/i
    );
});

test('CryptoEngine - ZeroSig Header & Body encryption/decryption roundtrip', async () => {
    const password = 'ZeroSigSecurePassword!';
    const lsbMode = 1;
    const bodyPlain = new TextEncoder().encode('Sıfır imza gövde verisi test içeriği.');

    // 1. Generate zero-sig package
    const { header, cipherBody } = await CryptoEngine.encryptZeroSig(bodyPlain, password, lsbMode);
    assert.strictEqual(header.length, 64, 'Header must be exactly 64 bytes');
    assert.strictEqual(cipherBody.length, bodyPlain.length + 16, 'CipherBody includes 16-byte GCM tag');

    // 2. Decrypt header
    const decryptedHeader = await CryptoEngine.decryptZeroSigHeader(header, password);
    assert.strictEqual(decryptedHeader.lsbMode, lsbMode);
    assert.strictEqual(decryptedHeader.cipherLen, bodyPlain.length + 16);

    // 3. Decrypt body
    const decryptedBody = await CryptoEngine.decryptZeroSigBody(cipherBody, decryptedHeader.key, decryptedHeader.ivBody);
    const decryptedText = new TextDecoder().decode(decryptedBody);
    assert.strictEqual(decryptedText, 'Sıfır imza gövde verisi test içeriği.');
});

test('CryptoEngine - ZeroSig Header rejects wrong password without leaking structure', async () => {
    const password = 'CorrectPassword';
    const wrongPassword = 'IncorrectPassword';
    const bodyPlain = new TextEncoder().encode('Gizli veri');
    const { header } = await CryptoEngine.encryptZeroSig(bodyPlain, password, 2);

    await assert.rejects(
        () => CryptoEngine.decryptZeroSigHeader(header, wrongPassword),
        /Parola yanlış|doğrulanamadı|bulunamadı/i
    );
});
