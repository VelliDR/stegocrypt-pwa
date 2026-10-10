/**
 * tests/unit/argon2_stego.test.ts
 * Argon2id Bellek-Zorlu KDF ve Steganografi Entegrasyon Testleri.
 * Format v3 başlığında kdfId (0x02), Adaptive/Scattered gömme ve extractAuto doğrulaması.
 */

import { describe, it, expect } from 'vitest';
import { StegoWorkerClient } from '../../src/workers/StegoWorkerClient.ts';
import { PngCodec } from '../../src/codec/PngCodec.ts';

describe('Argon2id Wasm Stego Pipeline & Auto Extraction', () => {
    it('executes Argon2id Adaptive embedding and transparent extraction end-to-end', async () => {
        const width = 64;
        const height = 64;
        const pixelData = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < pixelData.length; i += 4) {
            pixelData[i] = (i * 9) % 256;
            pixelData[i + 1] = (i * 17) % 256;
            pixelData[i + 2] = (i * 23) % 256;
            pixelData[i + 3] = 255;
        }

        const secretText = "TopSecret Payload with Argon2id SIMD Wasm 64MB Memory-Hard Protection!";
        const rawBuffer = new TextEncoder().encode(secretText).buffer;
        const pass = "Argon2id_MasterPass_2026!#$";

        const encryptResult = await StegoWorkerClient.execute<{
            pngBytes: ArrayBuffer;
            pixelBuffer: ArrayBuffer;
            width: number;
            height: number;
        }>('ENCRYPT_V3', {
            pixelBuffer: pixelData.buffer,
            width,
            height,
            rawBuffer,
            pass,
            lsbMode: 1,
            method: 'matching',
            distribution: 'adaptive',
            kdfType: 'argon2id'
        });

        expect(encryptResult.pngBytes).toBeDefined();

        // PNG dosyasını saf codec ile çöz
        const decodedPng = await PngCodec.decode(new Uint8Array(encryptResult.pngBytes));
        expect(decodedPng.width).toBe(width);
        expect(decodedPng.height).toBe(height);

        // extractAuto ile şeffaf biçimde (KDF belirtmeden) çöz
        const decryptResult = await StegoWorkerClient.execute<{
            decryptedBytes: ArrayBuffer;
        }>('DECRYPT_AUTO', {
            pixelBuffer: decodedPng.data.buffer,
            width: decodedPng.width,
            height: decodedPng.height,
            password: pass
        });

        const recoveredText = new TextDecoder().decode(new Uint8Array(decryptResult.decryptedBytes));
        expect(recoveredText).toBe(secretText);
    });

    it('executes Argon2id Scattered (Uniform) embedding and transparent extraction', async () => {
        const width = 64;
        const height = 64;
        const pixelData = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < pixelData.length; i += 4) {
            pixelData[i] = (i * 11) % 256;
            pixelData[i + 1] = (i * 19) % 256;
            pixelData[i + 2] = (i * 29) % 256;
            pixelData[i + 3] = 255;
        }

        const secretText = "Argon2id Scattered PRNG Stream Payload";
        const rawBuffer = new TextEncoder().encode(secretText).buffer;
        const pass = "Scattered_ArgonPass_999";

        const encryptResult = await StegoWorkerClient.execute<{
            pngBytes: ArrayBuffer;
        }>('ENCRYPT_V3', {
            pixelBuffer: pixelData.buffer,
            width,
            height,
            rawBuffer,
            pass,
            lsbMode: 2,
            method: 'matching',
            distribution: 'scattered',
            kdfType: 'argon2id'
        });

        const decodedPng = await PngCodec.decode(new Uint8Array(encryptResult.pngBytes));

        const decryptResult = await StegoWorkerClient.execute<{
            decryptedBytes: ArrayBuffer;
        }>('DECRYPT_AUTO', {
            pixelBuffer: decodedPng.data.buffer,
            width: decodedPng.width,
            height: decodedPng.height,
            password: pass
        });

        const recoveredText = new TextDecoder().decode(new Uint8Array(decryptResult.decryptedBytes));
        expect(recoveredText).toBe(secretText);
    });

    it('supports Deniable Double-Layer extraction with Argon2id', async () => {
        const width = 64;
        const height = 64;
        const pixelData = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < pixelData.length; i += 4) {
            pixelData[i] = (i * 5) % 256;
            pixelData[i + 1] = (i * 15) % 256;
            pixelData[i + 2] = (i * 25) % 256;
            pixelData[i + 3] = 255;
        }

        const realText = "CONFIDENTIAL: Actual Sensitive Information";
        const decoyText = "Innocent shopping list: milk, eggs, bread";

        const rawBuffer = new TextEncoder().encode(realText).buffer;
        const rawDecoy = new TextEncoder().encode(decoyText).buffer;

        const passReal = "StrongRealPassword!2026";
        const passDecoy = "DecoyPasswordForDuress#";

        const encryptResult = await StegoWorkerClient.execute<{
            pngBytes: ArrayBuffer;
        }>('ENCRYPT_V3', {
            pixelBuffer: pixelData.buffer,
            width,
            height,
            rawBuffer,
            pass: passReal,
            lsbMode: 1,
            method: 'matching',
            distribution: 'adaptive',
            kdfType: 'argon2id',
            isDeniable: true,
            rawDecoy,
            passDecoy
        });

        const decodedPng1 = await PngCodec.decode(new Uint8Array(encryptResult.pngBytes));

        // 1. Baskı altındaki şifre ile tuzak katmanın çözülmesi
        const decoyResult = await StegoWorkerClient.execute<{
            decryptedBytes: ArrayBuffer;
        }>('DECRYPT_AUTO', {
            pixelBuffer: decodedPng1.data.buffer,
            width: decodedPng1.width,
            height: decodedPng1.height,
            password: passDecoy
        });
        expect(new TextDecoder().decode(new Uint8Array(decoyResult.decryptedBytes))).toBe(decoyText);

        // 2. Gerçek şifre ile asıl gizli katmanın çözülmesi
        const decodedPng2 = await PngCodec.decode(new Uint8Array(encryptResult.pngBytes));

        const realResult = await StegoWorkerClient.execute<{
            decryptedBytes: ArrayBuffer;
        }>('DECRYPT_AUTO', {
            pixelBuffer: decodedPng2.data.buffer,
            width: decodedPng2.width,
            height: decodedPng2.height,
            password: passReal
        });
        expect(new TextDecoder().decode(new Uint8Array(realResult.decryptedBytes))).toBe(realText);
    });
});
