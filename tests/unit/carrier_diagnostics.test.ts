import { describe, it, expect } from 'vitest';
import { ImageEngine } from '../../src/codec/ImageEngine.ts';
import { AdaptiveEngine } from '../../src/stego/AdaptiveEngine.ts';
import { StegoEngine } from '../../src/stego/StegoEngine.ts';
import { CryptoEngine } from '../../src/crypto/CryptoEngine.ts';
import type { SimpleImageData } from '../../src/types/index.ts';

function createMockImageData(width: number, height: number, fillVal: number = 128): SimpleImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    data.fill(fillVal);
    // Alpha channel must be 255
    for (let i = 3; i < data.length; i += 4) {
        data[i] = 255;
    }
    return { width, height, data };
}

describe('Carrier Safety & Diagnostics', () => {
    it('ImageEngine.checkCarrierSafety accurately identifies lossy formats and social media filenames', () => {
        // 1. JPEG lossy check
        const jpegFile = { type: 'image/jpeg', name: 'sample.jpg' };
        const resJpeg = ImageEngine.checkCarrierSafety(jpegFile);
        expect(resJpeg.isLossy).toBe(true);
        expect(resJpeg.format).toBe('JPEG');
        expect(resJpeg.warning).toContain('kayıplı JPEG');

        // 2. WebP lossy check
        const webpFile = { type: 'image/webp', name: 'banner.webp' };
        const resWebp = ImageEngine.checkCarrierSafety(webpFile);
        expect(resWebp.isLossy).toBe(true);
        expect(resWebp.format).toBe('WebP');

        // 3. WhatsApp social media filename check
        const waFile = { type: 'image/png', name: 'WhatsApp Image 2026-10-10 at 15.30.22.png' };
        const resWa = ImageEngine.checkCarrierSafety(waFile);
        expect(resWa.isLossy).toBe(false);
        expect(resWa.isSocialMedia).toBe(true);
        expect(resWa.warning).toContain('sosyal medya veya mesajlaşma platformuna ait');

        // 4. Telegram filename check
        const tgFile = { type: 'image/png', name: 'telegram_photo_document.png' };
        const resTg = ImageEngine.checkCarrierSafety(tgFile);
        expect(resTg.isSocialMedia).toBe(true);

        // 5. Clean PNG carrier check
        const cleanFile = { type: 'image/png', name: 'secure_secret_carrier.png' };
        const resClean = ImageEngine.checkCarrierSafety(cleanFile);
        expect(resClean.isLossy).toBe(false);
        expect(resClean.isSocialMedia).toBe(false);
        expect(resClean.warning).toBeNull();
    });

    it('Stego Risk & Adaptive Guard: isTextureOverflow and risk levels', () => {
        const width = 64;
        const height = 64;
        const flatImg = createMockImageData(width, height, 128);

        // 1. Düz/homojen görselde güvenli doku sıfırdır, veri hemen aşım yapar
        const highRisk = AdaptiveEngine.calculateStegoRisk(50, width, height, flatImg.data, 1);
        expect(highRisk.level).toBe('high');
        expect(highRisk.isTextureOverflow).toBe(true);

        // 2. Yüksek dokulu görselde küçük veri düşük risk üretir
        const texturedImg = createMockImageData(width, height);
        for (let i = 0; i < texturedImg.data.length; i += 4) {
            texturedImg.data[i] = (i * 17) % 256;
            texturedImg.data[i + 1] = (i * 31) % 256;
            texturedImg.data[i + 2] = (i * 53) % 256;
            texturedImg.data[i + 3] = 255;
        }
        const lowRisk = AdaptiveEngine.calculateStegoRisk(10, width, height, texturedImg.data, 1);
        expect(lowRisk.level).toBe('low');
        expect(lowRisk.isTextureOverflow).toBe(false);
    });

    it('Diagnostic Clarity: StegoEngine.extractAuto differentiates wrong password on valid package vs absent package', async () => {
        const width = 80;
        const height = 80;
        const img = createMockImageData(width, height);

        // 1. Durum: Görselde hiçbir stego verisi yokken çözme denemesi
        await expect(
            StegoEngine.extractAuto(img, 'SomePassword123')
        ).rejects.toThrow(/Parola yanlış veya bu görselde şifreli veri bulunamadı/);

        // 2. Durum: Görselde geçerli STG1 paketi varken yanlış parola ile çözme denemesi
        const secretMsg = 'Tanısal Doğruluk Test Mesajı';
        const plainBytes = new TextEncoder().encode(secretMsg);
        const correctPass = 'CorrectPassword999';
        const wrongPass = 'IncorrectPassword000';

        const enc = await CryptoEngine.encryptBuffer(plainBytes, correctPass);
        StegoEngine.embedSequential(img, enc, 1);

        await expect(
            StegoEngine.extractAuto(img, wrongPass)
        ).rejects.toThrow(/Görselde şifreli StegoCrypt paketi/);
    });
});
