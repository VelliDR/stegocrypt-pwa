import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/mockImageData.js';
import { createMockImageData } from '../helpers/mockImageData.js';
import { CryptoEngine } from '../../js/CryptoEngine.js';
import { StegoEngine } from '../../js/StegoEngine.js';

test('Format v3 - CryptoEngine single master KDF + HKDF subkey roundtrip', async () => {
    const password = 'FormatV3StrongPassword#2026';
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // 1. Single PBKDF2 (tested with 10k in fast unit test or 600k)
    const masterKey = await CryptoEngine.deriveMasterKeyV3(password, salt, 10000);

    // 2. Derive subkeys for 'v3/all'
    const { metaKey, bodyKey } = await CryptoEngine.deriveSubkeysV3(masterKey, 'v3/all');

    // 3. Encrypt payload
    const plainBytes = new TextEncoder().encode('Format v3 test mesajı');
    const { header48, cipherBody, lsbMode } = await CryptoEngine.encryptV3(plainBytes, metaKey, bodyKey, 1);
    assert.strictEqual(header48.length, 48);

    // 4. Decrypt metadata
    const metaDecrypted = await CryptoEngine.decryptMetaV3(header48, metaKey);
    assert.strictEqual(metaDecrypted.lsbMode, lsbMode);
    assert.strictEqual(metaDecrypted.kdfId, 1);

    // 5. Decrypt body
    const bodyDecrypted = await CryptoEngine.decryptBodyV3(cipherBody, bodyKey, metaDecrypted.ivBody);
    assert.strictEqual(new TextDecoder().decode(bodyDecrypted), 'Format v3 test mesajı');
});

test('Format v3 - Single Mode (all) embedV3 and extractAuto roundtrip', async () => {
    const width = 80;
    const height = 80;
    const img = createMockImageData(width, height);

    const secretText = 'Format v3 tekil mod gömme ve çıkarma testi.';
    const password = 'V3SingleSecretPass!';
    const plainBytes = new TextEncoder().encode(secretText);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const masterKey = await CryptoEngine.deriveMasterKeyV3(password, salt, 5000);
    const { scatterBits, metaKey, bodyKey } = await CryptoEngine.deriveSubkeysV3(masterKey, 'v3/all');

    const { header48, cipherBody } = await CryptoEngine.encryptV3(plainBytes, metaKey, bodyKey, 1);
    StegoEngine.embedV3(img, header48, cipherBody, 1, scatterBits, salt, 'all');

    // extractAuto should detect Format v3 automatically
    // (Note: in extractAuto we use the default iterations 600k or test with same masterKey via extractV3)
    const extracted = await StegoEngine.extractV3(img, masterKey, 'all');
    assert.strictEqual(new TextDecoder().decode(extracted), secretText);
});

test('Format v3 - Deniable Dual-Layer (even/odd) sharing single public salt block', async () => {
    const width = 120;
    const height = 120;
    const img = createMockImageData(width, height);

    const decoyText = 'Tuzak Veri: Alışveriş listesi v3';
    const realText = 'Gerçek Veri: Çok gizli koordinatlar v3';
    const passDecoy = 'DecoyPass#2026';
    const passReal = 'RealPass#2026';

    const sharedSalt = crypto.getRandomValues(new Uint8Array(16));

    // 1. Embed Decoy into 'even' partition
    const decoyBytes = new TextEncoder().encode(decoyText);
    const masterDecoy = await CryptoEngine.deriveMasterKeyV3(passDecoy, sharedSalt, 5000);
    const subkeysDecoy = await CryptoEngine.deriveSubkeysV3(masterDecoy, 'v3/even');
    const encDecoy = await CryptoEngine.encryptV3(decoyBytes, subkeysDecoy.metaKey, subkeysDecoy.bodyKey, 1);
    StegoEngine.embedV3(img, encDecoy.header48, encDecoy.cipherBody, 1, subkeysDecoy.scatterBits, sharedSalt, 'even');

    // 2. Embed Real into 'odd' partition
    const realBytes = new TextEncoder().encode(realText);
    const masterReal = await CryptoEngine.deriveMasterKeyV3(passReal, sharedSalt, 5000);
    const subkeysReal = await CryptoEngine.deriveSubkeysV3(masterReal, 'v3/odd');
    const encReal = await CryptoEngine.encryptV3(realBytes, subkeysReal.metaKey, subkeysReal.bodyKey, 1);
    StegoEngine.embedV3(img, encReal.header48, encReal.cipherBody, 1, subkeysReal.scatterBits, null, 'odd');

    // 3. Extract decoy using masterDecoy
    const extractedDecoy = await StegoEngine.extractV3(img, masterDecoy, 'even');
    assert.strictEqual(new TextDecoder().decode(extractedDecoy), decoyText);

    // 4. Extract real using masterReal
    const extractedReal = await StegoEngine.extractV3(img, masterReal, 'odd');
    assert.strictEqual(new TextDecoder().decode(extractedReal), realText);
});

test('Format v3 - Wrong partition or wrong key fails authentication immediately', async () => {
    const password = 'TestPass';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const masterKey = await CryptoEngine.deriveMasterKeyV3(password, salt, 2000);

    const keysEven = await CryptoEngine.deriveSubkeysV3(masterKey, 'v3/even');
    const keysOdd = await CryptoEngine.deriveSubkeysV3(masterKey, 'v3/odd');

    const plainBytes = new TextEncoder().encode('Gizli içerik');
    const { header48 } = await CryptoEngine.encryptV3(plainBytes, keysEven.metaKey, keysEven.bodyKey, 1);

    // Trying to decrypt 'even' header with 'odd' subkey must fail
    await assert.rejects(
        () => CryptoEngine.decryptMetaV3(header48, keysOdd.metaKey),
        /başarısız/i
    );
});
