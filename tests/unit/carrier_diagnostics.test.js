import test from 'node:test';
import assert from 'node:assert/strict';
import '../helpers/mockImageData.js';
import { createMockImageData } from '../helpers/mockImageData.js';
import { ImageEngine } from '../../js/ImageEngine.js';
import { AdaptiveEngine } from '../../js/AdaptiveEngine.js';
import { StegoEngine } from '../../js/StegoEngine.js';
import { CryptoEngine } from '../../js/CryptoEngine.js';

test('Carrier Safety - ImageEngine.checkCarrierSafety accurately identifies lossy formats and social media filenames', () => {
    // 1. JPEG lossy check
    const jpegFile = { type: 'image/jpeg', name: 'sample.jpg' };
    const resJpeg = ImageEngine.checkCarrierSafety(jpegFile);
    assert.strictEqual(resJpeg.isLossy, true);
    assert.strictEqual(resJpeg.format, 'JPEG');
    assert.ok(resJpeg.warning.includes('kayıplı JPEG'));

    // 2. WebP lossy check
    const webpFile = { type: 'image/webp', name: 'banner.webp' };
    const resWebp = ImageEngine.checkCarrierSafety(webpFile);
    assert.strictEqual(resWebp.isLossy, true);
    assert.strictEqual(resWebp.format, 'WebP');

    // 3. WhatsApp social media filename check
    const waFile = { type: 'image/png', name: 'WhatsApp Image 2026-10-10 at 15.30.22.png' };
    const resWa = ImageEngine.checkCarrierSafety(waFile);
    assert.strictEqual(resWa.isLossy, false);
    assert.strictEqual(resWa.isSocialMedia, true);
    assert.ok(resWa.warning.includes('sosyal medya veya mesajlaşma platformuna ait'));

    // 4. Telegram filename check
    const tgFile = { type: 'image/png', name: 'telegram_photo_document.png' };
    const resTg = ImageEngine.checkCarrierSafety(tgFile);
    assert.strictEqual(resTg.isSocialMedia, true);

    // 5. Clean PNG carrier check
    const cleanFile = { type: 'image/png', name: 'secure_secret_carrier.png' };
    const resClean = ImageEngine.checkCarrierSafety(cleanFile);
    assert.strictEqual(resClean.isLossy, false);
    assert.strictEqual(resClean.isSocialMedia, false);
    assert.strictEqual(resClean.warning, null);
});

test('Stego Risk & Adaptive Guard - isTextureOverflow and strictSafeTexture prevention', () => {
    const width = 64;
    const height = 64;
    const flatImg = createMockImageData(width, height);

    // 1. Düz/homojen görselde güvenli doku sıfırdır, veri hemen aşım yapar
    const highRisk = AdaptiveEngine.calculateStegoRisk(50, width, height, flatImg.data, 1);
    assert.strictEqual(highRisk.level, 'high');
    assert.strictEqual(highRisk.isTextureOverflow, true);

    // 2. Yüksek dokulu görselde küçük veri düşük risk üretir
    const texturedImg = createMockImageData(width, height);
    for (let i = 0; i < texturedImg.data.length; i += 4) {
        texturedImg.data[i] = (i * 17) % 256;
        texturedImg.data[i + 1] = (i * 31) % 256;
        texturedImg.data[i + 2] = (i * 53) % 256;
    }
    const lowRisk = AdaptiveEngine.calculateStegoRisk(10, width, height, texturedImg.data, 1);
    assert.strictEqual(lowRisk.level, 'low');
    assert.strictEqual(lowRisk.isTextureOverflow, false);
});

test('Diagnostic Clarity - StegoEngine.extractAuto differentiates wrong password on valid package vs absent package', async () => {
    const width = 80;
    const height = 80;
    const img = createMockImageData(width, height);

    // 1. Durum: Görselde hiçbir stego verisi yokken çözme denemesi
    await assert.rejects(
        () => StegoEngine.extractAuto(img, 'SomePassword123'),
        (err) => {
            assert.strictEqual(err.message, 'Parola yanlış veya bu görselde şifreli veri bulunamadı.');
            return true;
        }
    );

    // 2. Durum: Görselde geçerli STG1 paketi varken yanlış parola ile çözme denemesi
    const secretMsg = 'Tanısal Doğruluk Test Mesajı';
    const plainBytes = new TextEncoder().encode(secretMsg);
    const correctPass = 'CorrectPassword999';
    const wrongPass = 'IncorrectPassword000';

    const enc = await CryptoEngine.encryptBuffer(plainBytes, correctPass);
    StegoEngine.embedSequential(img, enc, 1);

    await assert.rejects(
        () => StegoEngine.extractAuto(img, wrongPass),
        (err) => {
            assert.ok(err.message.includes('Görselde şifreli StegoCrypt paketi'));
            assert.ok(err.message.includes('parola hatalı veya kimlik doğrulama başarısız'));
            return true;
        }
    );
});
