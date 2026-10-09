import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/mockImageData.js';
import { AdaptiveEngine } from '../../js/AdaptiveEngine.js';
import { CryptoEngine } from '../../js/CryptoEngine.js';
import { StegoEngine } from '../../js/StegoEngine.js';
import { PngCodec } from '../../js/png/PngCodec.js';

test('AdaptiveEngine - computeTextureScores and getSortedPayloadPixels determinism and invariance', () => {
    const width = 64;
    const height = 64;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = (i * 3) & 0xFF;
        data[i + 1] = (i * 7) & 0xFF;
        data[i + 2] = (i * 11) & 0xFF;
        data[i + 3] = 255;
    }

    const scoresBefore = AdaptiveEngine.computeTextureScores(width, height, data);
    const sortedBefore = AdaptiveEngine.getSortedPayloadPixels(width, height, data);

    assert.ok(sortedBefore.length > 0, "Taşıyıcı piksel havuzu boş olmamalı");
    assert.equal(sortedBefore.length, Math.floor(((width - 2) * (height - 2)) / 2));

    // Taşıyıcı piksellerin (x+y) mod 2 === 1 kuralına uyduğunu doğrula
    for (let i = 0; i < sortedBefore.length; i++) {
        const idx = sortedBefore[i];
        const y = Math.floor(idx / width);
        const x = idx % width;
        assert.equal((x + y) % 2, 1, `Piksel ${idx} (x=${x}, y=${y}) dama tahtası kuralına uymalı`);
    }

    // Skorların azalan sırada olduğunu doğrula
    for (let i = 1; i < sortedBefore.length; i++) {
        const prevScore = scoresBefore[sortedBefore[i - 1]];
        const currScore = scoresBefore[sortedBefore[i]];
        assert.ok(prevScore >= currScore, `Skor sıralaması azalan olmalı: ${prevScore} >= ${currScore}`);
    }
});

test('AdaptiveEngine - calculateStegoRisk categorization logic', () => {
    const width = 64;
    const height = 64;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        // Kontrastlı doku üret
        data[i] = (i % 50 < 25) ? 20 : 220;
        data[i + 1] = (i % 70 < 35) ? 30 : 200;
        data[i + 2] = (i % 90 < 45) ? 40 : 180;
        data[i + 3] = 255;
    }

    // 1. Çok küçük veri (10 bayt) -> Düşük risk
    const riskLow = AdaptiveEngine.calculateStegoRisk(10, width, height, data, 1);
    assert.equal(riskLow.level, 'low');
    assert.equal(riskLow.label, 'Düşük Risk');
    assert.ok(riskLow.usagePercent <= 20);

    // 2. Büyük veri (kapasitenin %80'i) -> Yüksek tespit riski
    const safeBytes = riskLow.safeTextureBytes;
    const riskHigh = AdaptiveEngine.calculateStegoRisk(Math.floor(safeBytes * 0.85), width, height, data, 1);
    assert.equal(riskHigh.level, 'high');
    assert.equal(riskHigh.label, 'Yüksek Tespit Riski');

    // 3. Yetersiz görsel (minik görsel) -> Yüksek risk / Yetersiz
    const tinyData = new Uint8ClampedArray(4 * 4 * 4);
    const riskTiny = AdaptiveEngine.calculateStegoRisk(50, 4, 4, tinyData, 1);
    assert.equal(riskTiny.level, 'high');
    assert.equal(riskTiny.label, 'Yetersiz Görsel');
});

test('AdaptiveEngine - Format v3 Single Mode (all) 1-LSB and 2-LSB matching roundtrip', async () => {
    const width = 64;
    const height = 64;

    for (const lsbMode of [1, 2]) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = (i * 5) & 0xFF;
            data[i + 1] = (i * 9) & 0xFF;
            data[i + 2] = (i * 13) & 0xFF;
            data[i + 3] = 255;
        }
        const carrier = { width, height, data };

        const sharedSalt = crypto.getRandomValues(new Uint8Array(16));
        const password = `AdaptivePassword_${lsbMode}LSB`;
        const masterKey = await CryptoEngine.deriveMasterKeyV3(password, sharedSalt, 600000);
        const subkeys = await CryptoEngine.deriveSubkeysV3(masterKey, 'v3/all');

        const testMsg = `İçerik Duyarlı Steganografi Test Mesajı ${lsbMode}-LSB Matching`;
        const rawPayload = new Uint8Array(1 + new TextEncoder().encode(testMsg).length);
        rawPayload[0] = 0x10;
        rawPayload.set(new TextEncoder().encode(testMsg), 1);

        const enc = await CryptoEngine.encryptV3(rawPayload, subkeys.metaKey, subkeys.bodyKey, lsbMode);

        AdaptiveEngine.embedAdaptive(carrier, enc.header48, enc.cipherBody, lsbMode, subkeys.scatterBits, sharedSalt, 'all', 'matching');

        // PNG Codec bit-exact roundtrip
        const pngBytes = await PngCodec.encode(carrier);
        const decodedPng = await PngCodec.decode(pngBytes);

        // extractAuto ile şeffaf çözümleme
        const decryptedPayload = await StegoEngine.extractAuto(decodedPng, password);
        assert.equal(decryptedPayload[0], 0x10);
        const decryptedText = new TextDecoder().decode(decryptedPayload.subarray(1));
        assert.equal(decryptedText, testMsg);
    }
});

test('AdaptiveEngine - Format v3 Deniable Dual-Layer (even/odd) adaptive roundtrip', async () => {
    const width = 72;
    const height = 72;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = (i * 3 + 17) & 0xFF;
        data[i + 1] = (i * 7 + 43) & 0xFF;
        data[i + 2] = (i * 11 + 79) & 0xFF;
        data[i + 3] = 255;
    }
    const carrier = { width, height, data };

    const sharedSalt = crypto.getRandomValues(new Uint8Array(16));
    const passDecoy = "DecoyPassword123!";
    const passReal = "RealSecretPassword456!";

    // 1. Katman: Tuzak (even)
    const masterDecoy = await CryptoEngine.deriveMasterKeyV3(passDecoy, sharedSalt, 600000);
    const subkeysDecoy = await CryptoEngine.deriveSubkeysV3(masterDecoy, 'v3/even');
    const decoyMsg = "Tuzak Katman: Sıradan aile fotoğrafı.";
    const rawDecoy = new Uint8Array(1 + new TextEncoder().encode(decoyMsg).length);
    rawDecoy[0] = 0x10;
    rawDecoy.set(new TextEncoder().encode(decoyMsg), 1);
    const encDecoy = await CryptoEngine.encryptV3(rawDecoy, subkeysDecoy.metaKey, subkeysDecoy.bodyKey, 1);

    AdaptiveEngine.embedAdaptive(carrier, encDecoy.header48, encDecoy.cipherBody, 1, subkeysDecoy.scatterBits, sharedSalt, 'even', 'matching');

    // 2. Katman: Gerçek (odd)
    const masterReal = await CryptoEngine.deriveMasterKeyV3(passReal, sharedSalt, 600000);
    const subkeysReal = await CryptoEngine.deriveSubkeysV3(masterReal, 'v3/odd');
    const realMsg = "Gizli Katman: Çok gizli görev direktifleri.";
    const rawReal = new Uint8Array(1 + new TextEncoder().encode(realMsg).length);
    rawReal[0] = 0x10;
    rawReal.set(new TextEncoder().encode(realMsg), 1);
    const encReal = await CryptoEngine.encryptV3(rawReal, subkeysReal.metaKey, subkeysReal.bodyKey, 1);

    AdaptiveEngine.embedAdaptive(carrier, encReal.header48, encReal.cipherBody, 1, subkeysReal.scatterBits, null, 'odd', 'matching');

    // extractAuto ile her iki parolanın bağımsız olarak çözülmesi
    const resDecoy = await StegoEngine.extractAuto(carrier, passDecoy);
    assert.equal(new TextDecoder().decode(resDecoy.subarray(1)), decoyMsg);

    const resReal = await StegoEngine.extractAuto(carrier, passReal);
    assert.equal(new TextDecoder().decode(resReal.subarray(1)), realMsg);

    // Yanlış parola ile hata fırlatmalı
    await assert.rejects(async () => {
        await StegoEngine.extractAuto(carrier, "TotallyWrongPassword!");
    }, /Parola yanlış veya bu görselde şifreli veri bulunamadı/);
});

test('AdaptiveEngine - Rejects embedding when payload exceeds texture capacity', async () => {
    const width = 32;
    const height = 32;
    const data = new Uint8ClampedArray(width * height * 4);
    const carrier = { width, height, data };

    const sharedSalt = crypto.getRandomValues(new Uint8Array(16));
    const masterKey = await CryptoEngine.deriveMasterKeyV3("pass", sharedSalt, 600000);
    const subkeys = await CryptoEngine.deriveSubkeysV3(masterKey, 'v3/all');

    // Dev veri (32x32 görsel için çok büyük)
    const hugePayload = new Uint8Array(10000);
    const enc = await CryptoEngine.encryptV3(hugePayload, subkeys.metaKey, subkeys.bodyKey, 1);

    assert.throws(() => {
        AdaptiveEngine.embedAdaptive(carrier, enc.header48, enc.cipherBody, 1, subkeys.scatterBits, sharedSalt, 'all', 'matching');
    }, /kapasitesini aşıyor/);
});
