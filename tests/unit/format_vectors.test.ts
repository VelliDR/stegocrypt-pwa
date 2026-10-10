/**
 * tests/unit/format_vectors.test.ts
 * FORMAT.md Spesifikasyonu Resmi Test Vektörleri ve Vanilla JS v3.0 Geriye Dönük Uyumluluk Doğrulaması.
 */

import { describe, it, expect } from 'vitest';
import { CryptoEngine } from '../../src/crypto/CryptoEngine.ts';
import { StegoEngine } from '../../src/stego/StegoEngine.ts';
import { PngCodec } from '../../src/codec/PngCodec.ts';
import { KeyDerivation } from '../../src/crypto/KeyDerivation.ts';
import type { SimpleImageData } from '../../src/types/index.ts';

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/\s+/g, '');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function createMockImageData(width: number, height: number): SimpleImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 128;
        data[i + 1] = 128;
        data[i + 2] = 128;
        data[i + 3] = 255;
    }
    return { width, height, data };
}

describe('FORMAT.md Test Vectors & Backward Compatibility', () => {

    it('FORMAT.md Bölüm 5 - Format v1 (Sıralı 1-LSB) resmi ikili test vektörünü çözer', async () => {
        // FORMAT.md Section 5 Reference Test Vector:
        // Plaintext: "StegoCrypt Test 2026"
        // Password: "CorrectHorseBatteryStaple"
        const headerHex = "5354473100000024000102030405060708090a0b0c0d0e0fa0a1a2a3a4a5a6a7a8a9aaab";
        const cipherHex = "e76830fe5afce58b07959649d133aaf93a18689948edbfe6f9ba299d5ab1a291f5767ce0";
        const password = "CorrectHorseBatteryStaple";

        const headerBytes = hexToBytes(headerHex);
        const cipherBytes = hexToBytes(cipherHex);
        expect(headerBytes.length).toBe(36);
        expect(cipherBytes.length).toBe(36);

        // Tam paket (36 B başlık + 36 B şifreli gövde)
        const fullPayload = new Uint8Array(headerBytes.length + cipherBytes.length);
        fullPayload.set(headerBytes, 0);
        fullPayload.set(cipherBytes, headerBytes.length);

        // CryptoEngine.decryptBuffer ile doğrudan test vektörünü çöz
        const decrypted = await CryptoEngine.decryptBuffer(fullPayload, password);
        const plainText = new TextDecoder().decode(decrypted);

        expect(plainText).toBe("StegoCrypt Test 2026");
    });

    it('FORMAT.md Format v1 vektörünü içeren PNG görselini PngCodec ve extractAuto ile tam çözer', async () => {
        const headerHex = "5354473100000024000102030405060708090a0b0c0d0e0fa0a1a2a3a4a5a6a7a8a9aaab";
        const cipherHex = "e76830fe5afce58b07959649d133aaf93a18689948edbfe6f9ba299d5ab1a291f5767ce0";
        const password = "CorrectHorseBatteryStaple";

        const fullPayload = new Uint8Array(72);
        fullPayload.set(hexToBytes(headerHex), 0);
        fullPayload.set(hexToBytes(cipherHex), 36);

        // Taşıyıcı görsel oluştur ve sıralı modda göm
        const img = createMockImageData(64, 64);
        StegoEngine.embedSequential(img, fullPayload, 1);

        // Pure TS PNG Codec ile encode et
        const pngBytes = await PngCodec.encode(img);
        expect(pngBytes.length).toBeGreaterThan(0);

        // Pure TS PNG Codec ile decode et
        const decodedImg = await PngCodec.decode(pngBytes);
        expect(decodedImg.width).toBe(64);
        expect(decodedImg.height).toBe(64);

        // Akıllı şeffaf çözücü (extractAuto) ile çöz
        const recoveredBytes = await StegoEngine.extractAuto(decodedImg, password);
        expect(new TextDecoder().decode(recoveredBytes)).toBe("StegoCrypt Test 2026");
    });

    it('Format v2 (Zero-Signature Dağınık) Vanilla JS eşdeğeri tam döngü ve şeffaf çözüm', async () => {
        const img = createMockImageData(80, 80);
        const secretMessage = "Format v2 Sıfır-İmza Dağınık Uyumluluk Testi 2026";
        const password = "ZeroSigPassword#2026";

        const plainBytes = new TextEncoder().encode(secretMessage);
        const { header, cipherBody } = await CryptoEngine.encryptZeroSig(plainBytes, password, 1);

        // Vanilla v3.0 kurallarıyla göm
        await StegoEngine.embedScattered(img, header, cipherBody, 1, password, 'all');

        // PNG encode/decode döngüsü
        const pngBytes = await PngCodec.encode(img);
        const decodedImg = await PngCodec.decode(pngBytes);

        // extractAuto Format v2 paketini otomatik tanımalı
        const extractedBytes = await StegoEngine.extractAuto(decodedImg, password);
        expect(new TextDecoder().decode(extractedBytes)).toBe(secretMessage);
    });

    it('Vanilla JS v3.0 İnkâr Edilebilir Çift Katman (Deniable) formatını TS çözücüsü ayrıştırır', async () => {
        const width = 100;
        const height = 100;
        const img = createMockImageData(width, height);

        const decoyText = "Tuzak Katman: Vanilla JS Alışveriş Listesi";
        const realText = "Gerçek Katman: Çok Gizli Belgeler Vanilla Port";

        const passDecoy = "DecoyKey!1";
        const passReal = "RealKey!2";

        const sharedSalt = crypto.getRandomValues(new Uint8Array(16));

        // Decoy ('even' partition)
        const decoyBytes = new TextEncoder().encode(decoyText);
        const masterDecoy = await KeyDerivation.deriveMasterKeyV3(passDecoy, sharedSalt, 1000);
        const subkeysDecoy = await KeyDerivation.deriveSubkeysV3(masterDecoy, 'v3/even');
        const encDecoy = await CryptoEngine.encryptV3(decoyBytes, subkeysDecoy.metaKey as CryptoKey, subkeysDecoy.bodyKey as CryptoKey, 1);
        StegoEngine.embedV3(img, encDecoy.header48, encDecoy.cipherBody, 1, subkeysDecoy.scatterBits, sharedSalt, 'even');

        // Real ('odd' partition)
        const realBytes = new TextEncoder().encode(realText);
        const masterReal = await KeyDerivation.deriveMasterKeyV3(passReal, sharedSalt, 1000);
        const subkeysReal = await KeyDerivation.deriveSubkeysV3(masterReal, 'v3/odd');
        const encReal = await CryptoEngine.encryptV3(realBytes, subkeysReal.metaKey as CryptoKey, subkeysReal.bodyKey as CryptoKey, 1);
        StegoEngine.embedV3(img, encReal.header48, encReal.cipherBody, 1, subkeysReal.scatterBits, null, 'odd');

        // PNG dosya akışı
        const pngBytes = await PngCodec.encode(img);
        const decodedImg = await PngCodec.decode(pngBytes);

        // Decoy katmanı çıkar
        const extractedDecoy = await StegoEngine.extractV3(decodedImg, masterDecoy, 'even');
        expect(new TextDecoder().decode(extractedDecoy)).toBe(decoyText);

        // Real katmanı çıkar
        const extractedReal = await StegoEngine.extractV3(decodedImg, masterReal, 'odd');
        expect(new TextDecoder().decode(extractedReal)).toBe(realText);
    });

    it('Geçersiz parola ile Format v1 ve v2 korumaları bilgi sızdırmadan reddeder', async () => {
        const img = createMockImageData(60, 60);
        const plainBytes = new TextEncoder().encode("Güvenlik bariyeri testi");
        const correctPass = "StrongPass2026!";
        const wrongPass = "WrongPass999!";

        const { header, cipherBody } = await CryptoEngine.encryptZeroSig(plainBytes, correctPass, 1);
        await StegoEngine.embedScattered(img, header, cipherBody, 1, correctPass, 'all');

        await expect(StegoEngine.extractAuto(img, wrongPass)).rejects.toThrow();
    });
});
