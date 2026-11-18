/**
 * tests/unit/audit_regressions.test.ts
 * Kapsamlı denetim sonrası düzeltilen hata senaryoları ve yeni özellik regresyon testleri.
 */

import { describe, it, expect } from 'vitest';
import { PngCodec, crc32 } from '../../src/codec/PngCodec.ts';
import { ImageEngine } from '../../src/codec/ImageEngine.ts';
import { QREngine } from '../../src/codec/QREngine.ts';
import { StegoWorkerClient } from '../../src/workers/StegoWorkerClient.ts';
import { AdaptiveEngine } from '../../src/stego/AdaptiveEngine.ts';
import { VariationSelectorEngine } from '../../src/stego/VariationSelectorEngine.ts';
import { SteganalysisEngine } from '../../src/forensics/SteganalysisEngine.ts';
import { DiffEngine } from '../../src/forensics/DiffEngine.ts';
import { BinaryInspector } from '../../src/forensics/BinaryInspector.ts';
import { ZstegScanner } from '../../src/forensics/ZstegScanner.ts';
import { KeyDerivation } from '../../src/crypto/KeyDerivation.ts';
import { CryptoEngine } from '../../src/crypto/CryptoEngine.ts';
import type { SimpleImageData } from '../../src/types/index.ts';

function buildPngChunk(typeStr: string, payload: Uint8Array): Uint8Array {
    const typeBytes = new TextEncoder().encode(typeStr);
    const chunk = new Uint8Array(8 + payload.length + 4);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, payload.length, false);
    chunk.set(typeBytes, 4);
    chunk.set(payload, 8);
    const c = crc32(chunk.subarray(4, 8 + payload.length));
    view.setUint32(8 + payload.length, c, false);
    return chunk;
}

describe('Audit Regression & New Capability Suite', () => {
    it('PngCodec.decode rejects Adam7 interlaced PNG instead of silently corrupting pixels', async () => {
        const ihdr = new Uint8Array(13);
        const ihdrView = new DataView(ihdr.buffer);
        ihdrView.setUint32(0, 4, false);
        ihdrView.setUint32(4, 4, false);
        ihdr[8] = 8;  // bitDepth
        ihdr[9] = 6;  // RGBA
        ihdr[12] = 1; // Adam7 Interlaced!

        const sig = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const ihdrChunk = buildPngChunk('IHDR', ihdr);
        const idatChunk = buildPngChunk('IDAT', new Uint8Array([0x78, 0x9C, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]));
        const iendChunk = buildPngChunk('IEND', new Uint8Array(0));

        const png = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
        let p = 0;
        png.set(sig, p); p += sig.length;
        png.set(ihdrChunk, p); p += ihdrChunk.length;
        png.set(idatChunk, p); p += idatChunk.length;
        png.set(iendChunk, p);

        await expect(PngCodec.decode(png)).rejects.toThrow(/interlace/i);
    });

    it('ImageEngine.loadImageData preserves alpha channel when preserveAlpha=true and rejects HEIC cleanly', async () => {
        const data = new Uint8ClampedArray(4 * 4 * 4).fill(120);
        data[3] = 42;
        data[7] = 123;
        const pngBytes = await PngCodec.encode({ width: 4, height: 4, data });
        const blob = new Blob([pngBytes as unknown as BlobPart], { type: 'image/png' });

        const preserved = await ImageEngine.loadImageData(blob, { preserveAlpha: true });
        expect(preserved.data[3]).toBe(42);
        expect(preserved.data[7]).toBe(123);

        const flattened = await ImageEngine.loadImageData(blob, { preserveAlpha: false });
        expect(flattened.data[3]).toBe(255);
        expect(flattened.data[7]).toBe(255);

        const fakeHeic = { name: 'photo.heic', type: 'image/heic', arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File;
        await expect(ImageEngine.loadImageData(fakeHeic)).rejects.toThrow(/HEIC\/HEIF/i);
    });

    it('StegoWorkerClient executes Sequential (Format v1) via ENCRYPT_V3 and extracts with DECRYPT_AUTO', async () => {
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 100;
            data[i + 1] = 150;
            data[i + 2] = 200;
            data[i + 3] = 255;
        }

        const secretText = 'Format v1 Sequential Roundtrip via WorkerClient!';
        const rawBuffer = new TextEncoder().encode(secretText).buffer;
        const pass = 'SequentialPass123!';

        const enc = await StegoWorkerClient.execute<{ pngBytes: ArrayBuffer }>('ENCRYPT_V3', {
            pixelBuffer: data.buffer,
            width,
            height,
            rawBuffer,
            pass,
            lsbMode: 2,
            method: 'matching',
            distribution: 'sequential'
        });

        const decodedPng = await PngCodec.decode(new Uint8Array(enc.pngBytes));
        // Format v1 header starts with ASCII 'STG2' in first 32 channels (1-LSB MSB)
        const magicBits = [];
        for (let ch = 0; ch < 32; ch++) {
            const px = Math.floor(ch / 3);
            const c = ch % 3;
            magicBits.push(decodedPng.data[px * 4 + c]! & 1);
        }
        const magicBytes = new Uint8Array(4);
        for (let b = 0; b < 4; b++) {
            let v = 0;
            for (let bit = 0; bit < 8; bit++) v = (v << 1) | magicBits[b * 8 + bit]!;
            magicBytes[b] = v;
        }
        expect(new TextDecoder().decode(magicBytes)).toBe('STG2');

        const dec = await StegoWorkerClient.execute<{ decryptedBytes: ArrayBuffer }>('DECRYPT_AUTO', {
            pixelBuffer: decodedPng.data.buffer,
            width: decodedPng.width,
            height: decodedPng.height,
            password: pass
        });
        expect(new TextDecoder().decode(new Uint8Array(dec.decryptedBytes))).toBe(secretText);
    });

    it('StegoWorkerClient executes ChaCha20-Poly1305 (Adaptive + Deniable) roundtrip and auto-decrypts', async () => {
        const width = 64;
        const height = 64;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = (i * 13) % 256;
            data[i + 1] = (i * 29) % 256;
            data[i + 2] = (i * 47) % 256;
            data[i + 3] = 255;
        }

        const decoyText = 'ChaCha20 Tuzak Katman';
        const realText = 'ChaCha20 Gerçek Gizli Katman #2026';
        const passDecoy = 'ChaChaDecoyPass!';
        const passReal = 'ChaChaRealPass!';

        const enc = await StegoWorkerClient.execute<{ pngBytes: ArrayBuffer }>('ENCRYPT_V3', {
            pixelBuffer: data.buffer,
            width,
            height,
            rawBuffer: new TextEncoder().encode(realText).buffer,
            pass: passReal,
            lsbMode: 1,
            method: 'matching',
            distribution: 'adaptive',
            cipherAlgorithm: 'chacha20-poly1305',
            isDeniable: true,
            rawDecoy: new TextEncoder().encode(decoyText).buffer,
            passDecoy
        });

        const decoded1 = await PngCodec.decode(new Uint8Array(enc.pngBytes));
        const resDecoy = await StegoWorkerClient.execute<{ decryptedBytes: ArrayBuffer }>('DECRYPT_AUTO', {
            pixelBuffer: decoded1.data.buffer,
            width: decoded1.width,
            height: decoded1.height,
            password: passDecoy
        });
        expect(new TextDecoder().decode(new Uint8Array(resDecoy.decryptedBytes))).toBe(decoyText);

        const decoded2 = await PngCodec.decode(new Uint8Array(enc.pngBytes));
        const resReal = await StegoWorkerClient.execute<{ decryptedBytes: ArrayBuffer }>('DECRYPT_AUTO', {
            pixelBuffer: decoded2.data.buffer,
            width: decoded2.width,
            height: decoded2.height,
            password: passReal
        });
        expect(new TextDecoder().decode(new Uint8Array(resReal.decryptedBytes))).toBe(realText);
    });

    it('AdaptiveEngine avoids salt/payload collision on narrow images (width < 43)', async () => {
        const width = 32;
        const height = 100;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = (i * 19) % 256;
            data[i + 1] = (i * 37) % 256;
            data[i + 2] = (i * 59) % 256;
            data[i + 3] = 255;
        }
        const img: SimpleImageData = { width, height, data };
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const masterKey = await KeyDerivation.deriveMasterKeyV3('NarrowPass!', salt, 1000);
        const subkeys = await KeyDerivation.deriveSubkeysV3(masterKey, 'v3/all');
        const msg = 'Narrow width adaptive safety test';
        const enc = await CryptoEngine.encryptV3(new TextEncoder().encode(msg), subkeys.metaKey as CryptoKey, subkeys.bodyKey as CryptoKey, 1);

        AdaptiveEngine.embedAdaptive(img, enc.header48, enc.cipherBody, 1, subkeys.scatterBits, salt, 'all', 'matching');
        const extracted = await AdaptiveEngine.extractAdaptive(img, masterKey, 'all');
        expect(new TextDecoder().decode(extracted)).toBe(msg);
    });

    it('SteganalysisEngine.renderHeatmap scores LSB-stego blocks higher (redder) than clean blocks', () => {
        const width = 64;
        const height = 64;
        // Natural clean image with unequal (2k, 2k+1) pairs
        const cleanData = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < cleanData.length; i += 4) {
            cleanData[i] = 100 + ((i / 4) % 20) * 2;     // always even
            cleanData[i + 1] = 120 + ((i / 4) % 15) * 2; // always even
            cleanData[i + 2] = 140 + ((i / 4) % 10) * 2; // always even
            cleanData[i + 3] = 255;
        }
        const cleanHeat = SteganalysisEngine.renderHeatmap({ width, height, data: cleanData }, 32);

        // Stego image with equalized PoVs (deterministic uncorrelated 0/1 LSB across channels)
        const stegoData = new Uint8ClampedArray(cleanData);
        for (let i = 0; i < stegoData.length; i += 4) {
            const px = i / 4;
            const row = Math.floor(px / width);
            const bit0 = (px ^ row) & 1;
            const bit1 = ((px >> 1) ^ row) & 1;
            const bit2 = ((px + row) ^ (px >> 2)) & 1;
            stegoData[i] = (stegoData[i]! & 0xFE) | bit0;
            stegoData[i + 1] = (stegoData[i + 1]! & 0xFE) | bit1;
            stegoData[i + 2] = (stegoData[i + 2]! & 0xFE) | bit2;
        }
        const stegoHeat = SteganalysisEngine.renderHeatmap({ width, height, data: stegoData }, 32);

        // Red channel = stego probability, Green channel = clean confidence
        expect(stegoHeat.data[0]!).toBeGreaterThan(cleanHeat.data[0]!);
        expect(stegoHeat.data[1]!).toBeLessThan(cleanHeat.data[1]!);
    });

    it('SteganalysisEngine.analyzeChiSquare does not false-positive when pair counts are insufficient (k < 2)', () => {
        // 8x8 = 64 pixels spread across all 256 values -> every pair sum < 10 -> k === 0
        const data = new Uint8ClampedArray(8 * 8 * 4);
        for (let i = 0; i < data.length; i += 4) {
            const p = i / 4;
            data[i] = (p * 4) % 256;
            data[i + 1] = (p * 4 + 2) % 256;
            data[i + 2] = (p * 4 + 3) % 256;
            data[i + 3] = 255;
        }
        const res = SteganalysisEngine.analyzeChiSquare({ width: 8, height: 8, data });
        expect(res.isStego).toBe(false);
        expect(res.probability).toBe(0);
    });

    it('DiffEngine.computeSSIM detects inverted tiny (< 8x8) images accurately', () => {
        const img1: SimpleImageData = {
            width: 4,
            height: 4,
            data: new Uint8ClampedArray(4 * 4 * 4).fill(0)
        };
        const img2: SimpleImageData = {
            width: 4,
            height: 4,
            data: new Uint8ClampedArray(4 * 4 * 4).fill(255)
        };
        const ssim = DiffEngine.computeSSIM(img1, img2);
        expect(ssim).toBeLessThan(0.1);
    });

    it('BinaryInspector flags truncated PNG missing IEND as alert', async () => {
        const png = await PngCodec.encode({ width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(100) });
        const truncated = png.subarray(0, png.length - 12); // Strip IEND chunk
        const report = BinaryInspector.inspectPng(truncated);
        expect(report.verdictLevel).toBe('alert');
        expect(report.verdict).toMatch(/IEND/i);
    });

    it('ZstegScanner detects cyber/secret flags and flags past byte 512', () => {
        const width = 100;
        const height = 100;
        const data = new Uint8ClampedArray(width * height * 4).fill(0);
        const flagStr = 'A'.repeat(600) + 'secret{deep_offset_2026}';
        let p = 0;
        for (let i = 0; i < flagStr.length; i++) {
            const b = flagStr.charCodeAt(i);
            for (let bit = 0; bit < 8; bit++) {
                data[p * 4 + 1] = (b >> bit) & 1; // Green channel 1-LSB
                p++;
            }
        }
        const findings = ZstegScanner.scan({ width, height, data });
        const found = findings.find(f => f.comboId === 'g,1b,lsb,xy');
        expect(found).toBeDefined();
        expect(found?.textSample).toContain('secret{deep_offset_2026}');
    });

    it('VariationSelectorEngine & QREngine enforce upper bounds cleanly', () => {
        const oversizedVs = new Uint8Array(65536);
        expect(() => VariationSelectorEngine.encode(oversizedVs)).toThrow(/65535/);

        const oversizedQrH = 'A'.repeat(1300);
        expect(() => QREngine.createQR(oversizedQrH, 'H')).toThrow(/Level H/i);
    });

    it('StegoWorkerClient fallbackExecute supports RENDER_BIT_PLANE, RENDER_HEATMAP, and RENDER_AMPLIFIED_DIFF', async () => {
        const width = 16;
        const height = 16;
        const d1 = new Uint8ClampedArray(width * height * 4).fill(100);
        const d2 = new Uint8ClampedArray(width * height * 4).fill(101);

        const bp = await StegoWorkerClient.execute<{ bitPlaneBuffer: ArrayBuffer }>('RENDER_BIT_PLANE', {
            pixelBuffer: d2.buffer.slice(0),
            width,
            height,
            channel: 'all',
            bitDepth: 0
        });
        expect(bp.bitPlaneBuffer.byteLength).toBe(d2.byteLength);

        const hm = await StegoWorkerClient.execute<{ heatmapBuffer: ArrayBuffer }>('RENDER_HEATMAP', {
            pixelBuffer: d2.buffer.slice(0),
            width,
            height,
            blockSize: 16
        });
        expect(hm.heatmapBuffer.byteLength).toBe(d2.byteLength);

        const amp = await StegoWorkerClient.execute<{ ampDiffBuffer: ArrayBuffer }>('RENDER_AMPLIFIED_DIFF', {
            pixelBuffer1: d1.buffer.slice(0),
            pixelBuffer2: d2.buffer.slice(0),
            width,
            height,
            amplifier: 50
        });
        const ampArr = new Uint8ClampedArray(amp.ampDiffBuffer);
        expect(ampArr[0]).toBe(50);
    });
});
