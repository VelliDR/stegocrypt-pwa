import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/mockImageData.js';
import { createMockImageData } from '../helpers/mockImageData.js';
import { StegoEngine } from '../../js/StegoEngine.js';
import { CryptoEngine } from '../../js/CryptoEngine.js';

test('StegoEngine - Sequential 1-LSB embedding and extraction roundtrip', async () => {
    const width = 100;
    const height = 100;
    const img = createMockImageData(width, height);

    const message = 'Sequential 1-LSB gizli mesajı test ediliyor.';
    const plainBytes = new TextEncoder().encode(message);
    const password = 'SequentialPass1';

    const encrypted = await CryptoEngine.encryptBuffer(plainBytes, password);
    StegoEngine.embedSequential(img, encrypted, 1);

    const extractedPayload = StegoEngine.extractSequential(img);
    const decrypted = await CryptoEngine.decryptBuffer(extractedPayload, password);
    const resultText = new TextDecoder().decode(decrypted);

    assert.strictEqual(resultText, message);
});

test('StegoEngine - Sequential 2-LSB embedding and extraction roundtrip', async () => {
    const width = 100;
    const height = 100;
    const img = createMockImageData(width, height);

    const message = 'Sequential 2-LSB yüksek kapasiteli test mesajı.';
    const plainBytes = new TextEncoder().encode(message);
    const password = 'SequentialPass2';

    const encrypted = await CryptoEngine.encryptBuffer(plainBytes, password);
    // STG2 magic header
    const stg2Payload = new Uint8Array(encrypted);
    new TextEncoder().encodeInto('STG2', stg2Payload);

    StegoEngine.embedSequential(img, stg2Payload, 2);

    const extractedPayload = StegoEngine.extractSequential(img);
    const decrypted = await CryptoEngine.decryptBuffer(extractedPayload, password);
    const resultText = new TextDecoder().decode(decrypted);

    assert.strictEqual(resultText, message);
});

test('StegoEngine - Scattered Single Mode (all) ZeroSig roundtrip', async () => {
    const width = 80;
    const height = 80;
    const img = createMockImageData(width, height);

    const message = 'Dağınık ZeroSig homojen gömme testi.';
    const plainBytes = new TextEncoder().encode(message);
    const password = 'ScatteredPassword123';

    const { header, cipherBody } = await CryptoEngine.encryptZeroSig(plainBytes, password, 1);
    await StegoEngine.embedScattered(img, header, cipherBody, 1, password, 'all');

    const extractedBody = await StegoEngine.extractScattered(img, password, 'all');
    const resultText = new TextDecoder().decode(extractedBody);

    assert.strictEqual(resultText, message);
});

test('StegoEngine - Deniable Dual-Layer (even/odd) and extractAuto resolution', async () => {
    const width = 120;
    const height = 120;
    const img = createMockImageData(width, height);

    const decoyText = 'Tuzak Metin: Önemsiz alışveriş listesi: elma, armut, süt.';
    const realText = 'Gerçek Metin: Çok gizli operasyonel koordinatlar: 41.0082, 28.9784.';

    const passDecoy = 'DecoyPassword#1';
    const passReal = 'RealPassword#2';

    // 1. Decoy layer into 'even' partition
    const decoyBytes = new TextEncoder().encode(decoyText);
    const { header: hDecoy, cipherBody: cbDecoy } = await CryptoEngine.encryptZeroSig(decoyBytes, passDecoy, 1);
    await StegoEngine.embedScattered(img, hDecoy, cbDecoy, 1, passDecoy, 'even');

    // 2. Real layer into 'odd' partition
    const realBytes = new TextEncoder().encode(realText);
    const { header: hReal, cipherBody: cbReal } = await CryptoEngine.encryptZeroSig(realBytes, passReal, 1);
    await StegoEngine.embedScattered(img, hReal, cbReal, 1, passReal, 'odd');

    // 3. Extract decoy using extractAuto with passDecoy
    const extractedDecoy = await StegoEngine.extractAuto(img, passDecoy);
    assert.strictEqual(new TextDecoder().decode(extractedDecoy), decoyText);

    // 4. Extract real using extractAuto with passReal
    const extractedReal = await StegoEngine.extractAuto(img, passReal);
    assert.strictEqual(new TextDecoder().decode(extractedReal), realText);

    // 5. Wrong password fails
    await assert.rejects(
        () => StegoEngine.extractAuto(img, 'CompletelyWrongPassword'),
        /Parola yanlış/i
    );
});
