/**
 * src/workers/stego.worker.ts
 * Dedicated Web Worker Pipeline: KDF, AES-GCM, Argon2id, Steganografi ve Adli Bilişim İş Parçacığı.
 * Transferable Objects ile sıfır-kopyalama ($O(0)$ RAM transferi).
 */

import { CryptoEngine } from '../crypto/CryptoEngine.ts';
import { KeyDerivation } from '../crypto/KeyDerivation.ts';
import { StegoEngine } from '../stego/StegoEngine.ts';
import { AdaptiveEngine } from '../stego/AdaptiveEngine.ts';
import { PngCodec } from '../codec/PngCodec.ts';
import { SteganalysisEngine } from '../forensics/SteganalysisEngine.ts';
import { BinaryInspector } from '../forensics/BinaryInspector.ts';
import { DiffEngine } from '../forensics/DiffEngine.ts';
import { ZeroWidthDetector } from '../forensics/ZeroWidthDetector.ts';
import { ZstegScanner } from '../forensics/ZstegScanner.ts';
import type { WorkerRequest, WorkerResponse } from '../types/index.ts';

function sendProgress(id: string, percent: number, text: string): void {
    self.postMessage({ type: 'PROGRESS', id, percent, text } as WorkerResponse);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>): Promise<void> => {
    const { action, id, data } = e.data;

    try {
        if (action === 'ENCRYPT_V3') {
            const { pixelBuffer, width, height, rawBuffer, pass, lsbMode, isDeniable, rawDecoy, passDecoy } = data;
            const method = data.method || 'matching';
            const distribution = data.distribution || 'adaptive';
            const kdfType = data.kdfType || 'pbkdf2';
            const kdfId = kdfType === 'argon2id' ? 0x02 : 0x01;
            const imageData = {
                width,
                height,
                data: new Uint8ClampedArray(pixelBuffer)
            };

            const sharedSalt = crypto.getRandomValues(new Uint8Array(16));

            if (isDeniable && rawDecoy && passDecoy) {
                // Çift Katmanlı İnkâr Modu
                const kdfName = kdfType === 'argon2id' ? 'Argon2id SIMD Wasm 64MB' : '600.000 PBKDF2';
                sendProgress(id, 10, `1/4: Tuzak katman anahtarı türetiliyor (${kdfName})...`);
                const masterDecoy = kdfType === 'argon2id'
                    ? await KeyDerivation.deriveMasterKeyArgon2id(passDecoy, sharedSalt)
                    : await KeyDerivation.deriveMasterKeyV3(passDecoy, sharedSalt, 600000);
                const subkeysDecoy = await KeyDerivation.deriveSubkeysV3(masterDecoy, 'v3/even');

                sendProgress(id, 30, `2/4: Tuzak katman şifreleniyor (${method}, ${distribution})...`);
                const encDecoy = await CryptoEngine.encryptV3(new Uint8Array(rawDecoy), subkeysDecoy.metaKey as CryptoKey, subkeysDecoy.bodyKey as CryptoKey, lsbMode, kdfId);
                if (distribution === 'adaptive') {
                    AdaptiveEngine.embedAdaptive(imageData, encDecoy.header48, encDecoy.cipherBody, lsbMode, subkeysDecoy.scatterBits, sharedSalt, 'even', method);
                } else {
                    StegoEngine.embedV3(imageData, encDecoy.header48, encDecoy.cipherBody, lsbMode, subkeysDecoy.scatterBits, sharedSalt, 'even', method);
                }

                sendProgress(id, 50, `3/4: Gerçek katman anahtarı türetiliyor (${kdfName})...`);
                const masterReal = kdfType === 'argon2id'
                    ? await KeyDerivation.deriveMasterKeyArgon2id(pass, sharedSalt)
                    : await KeyDerivation.deriveMasterKeyV3(pass, sharedSalt, 600000);
                const subkeysReal = await KeyDerivation.deriveSubkeysV3(masterReal, 'v3/odd');

                sendProgress(id, 75, `4/4: Gerçek katman şifreleniyor (${method}, ${distribution})...`);
                const encReal = await CryptoEngine.encryptV3(new Uint8Array(rawBuffer), subkeysReal.metaKey as CryptoKey, subkeysReal.bodyKey as CryptoKey, lsbMode, kdfId);
                if (distribution === 'adaptive') {
                    AdaptiveEngine.embedAdaptive(imageData, encReal.header48, encReal.cipherBody, lsbMode, subkeysReal.scatterBits, null, 'odd', method);
                } else {
                    StegoEngine.embedV3(imageData, encReal.header48, encReal.cipherBody, lsbMode, subkeysReal.scatterBits, null, 'odd', method);
                }
            } else {
                // Tekil Mod (v3/all)
                const kdfName = kdfType === 'argon2id' ? 'Argon2id SIMD Wasm 64MB' : '600.000 PBKDF2';
                sendProgress(id, 20, `1/3: Master anahtar türetiliyor (${kdfName})...`);
                const masterKey = kdfType === 'argon2id'
                    ? await KeyDerivation.deriveMasterKeyArgon2id(pass, sharedSalt)
                    : await KeyDerivation.deriveMasterKeyV3(pass, sharedSalt, 600000);
                const subkeys = await KeyDerivation.deriveSubkeysV3(masterKey, 'v3/all');

                sendProgress(id, 50, "2/3: Veri şifreleniyor (AES-256-GCM)...");
                const enc = await CryptoEngine.encryptV3(new Uint8Array(rawBuffer), subkeys.metaKey as CryptoKey, subkeys.bodyKey as CryptoKey, lsbMode, kdfId);

                sendProgress(id, 75, `3/3: Piksellere dağıtılıyor (Format v3, ${method}, ${distribution})...`);
                if (distribution === 'adaptive') {
                    AdaptiveEngine.embedAdaptive(imageData, enc.header48, enc.cipherBody, lsbMode, subkeys.scatterBits, sharedSalt, 'all', method);
                } else {
                    StegoEngine.embedV3(imageData, enc.header48, enc.cipherBody, lsbMode, subkeys.scatterBits, sharedSalt, 'all', method);
                }
            }

            sendProgress(id, 90, "PNG kodlanıyor (saf deterministik codec)...");
            const pngBytes = await PngCodec.encode({ width, height, data: imageData.data });

            sendProgress(id, 100, "Tamamlandı!");
            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        pngBytes: pngBytes.buffer,
                        pixelBuffer: imageData.data.buffer,
                        width,
                        height
                    }
                },
                [pngBytes.buffer, imageData.data.buffer]
            );

        } else if (action === 'DECRYPT_AUTO') {
            const { pixelBuffer, width, height, password } = data;
            const imageData = {
                width,
                height,
                data: new Uint8ClampedArray(pixelBuffer)
            };

            sendProgress(id, 30, "Şifreli veri aranıyor ve çözülüyor (Format v3/v2/v1)...");
            const decryptedBytes = await StegoEngine.extractAuto(imageData, password);

            sendProgress(id, 100, "Şifre başarıyla çözüldü!");
            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        decryptedBytes: decryptedBytes.buffer,
                        pixelBuffer: imageData.data.buffer
                    }
                },
                [decryptedBytes.buffer, imageData.data.buffer]
            );

        } else if (action === 'ANALYZE_CHI_SQUARE') {
            const { pixelBuffer, width, height } = data;
            const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
            const analysis = SteganalysisEngine.analyzeChiSquare(imageData);
            self.postMessage(
                { type: 'SUCCESS', id, result: { analysis, pixelBuffer: imageData.data.buffer } },
                [imageData.data.buffer]
            );

        } else if (action === 'RENDER_BIT_PLANE') {
            const { pixelBuffer, width, height, channel, bitDepth } = data;
            const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
            const bitPlane = SteganalysisEngine.renderBitPlane(imageData, channel, bitDepth);
            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        bitPlaneBuffer: bitPlane.data.buffer,
                        pixelBuffer: imageData.data.buffer,
                        width,
                        height
                    }
                },
                [bitPlane.data.buffer, imageData.data.buffer]
            );

        } else if (action === 'ANALYZE_RS') {
            const { pixelBuffer, width, height, channel } = data;
            const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
            const rsResult = SteganalysisEngine.analyzeRS(imageData, channel || 'all');
            self.postMessage(
                { type: 'SUCCESS', id, result: { rsResult, pixelBuffer: imageData.data.buffer } },
                [imageData.data.buffer]
            );

        } else if (action === 'RENDER_HEATMAP') {
            const { pixelBuffer, width, height, blockSize } = data;
            const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
            const heatmap = SteganalysisEngine.renderHeatmap(imageData, blockSize || 32);
            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        heatmapBuffer: heatmap.data.buffer,
                        pixelBuffer: imageData.data.buffer,
                        width,
                        height
                    }
                },
                [heatmap.data.buffer, imageData.data.buffer]
            );

        } else if (action === 'PNG_DECODE') {
            const { fileBuffer } = data;
            const decoded = await PngCodec.decode(fileBuffer);
            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        width: decoded.width,
                        height: decoded.height,
                        pixelBuffer: decoded.data.buffer
                    }
                },
                [decoded.data.buffer]
            );

        } else if (action === 'CALCULATE_RISK') {
            const { pixelBuffer, width, height, payloadBytes, lsbMode } = data;
            const risk = AdaptiveEngine.calculateStegoRisk(
                payloadBytes,
                width,
                height,
                new Uint8ClampedArray(pixelBuffer),
                lsbMode || 1
            );
            self.postMessage(
                { type: 'SUCCESS', id, result: { risk, pixelBuffer } },
                [pixelBuffer]
            );

        } else if (action === 'INSPECT_BINARY') {
            const { fileBuffer } = data;
            const report = BinaryInspector.inspect(fileBuffer);
            self.postMessage(
                { type: 'SUCCESS', id, result: { report, fileBuffer } },
                [fileBuffer]
            );

        } else if (action === 'COMPARE_IMAGES') {
            const { pixelBuffer1, pixelBuffer2, width, height } = data;
            const amplifier = data.amplifier || 20;
            const img1 = { width, height, data: new Uint8ClampedArray(pixelBuffer1) };
            const img2 = { width, height, data: new Uint8ClampedArray(pixelBuffer2) };

            const comp = DiffEngine.compare(img1, img2);
            const ampDiff = DiffEngine.renderAmplifiedDiff(img1, img2, amplifier);
            const lsbDiff = DiffEngine.renderLsbDiff(img1, img2);

            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        comparison: comp,
                        ampDiffBuffer: ampDiff.data.buffer,
                        lsbDiffBuffer: lsbDiff.data.buffer,
                        pixelBuffer1,
                        pixelBuffer2,
                        width,
                        height
                    }
                },
                [ampDiff.data.buffer, lsbDiff.data.buffer, pixelBuffer1, pixelBuffer2]
            );

        } else if (action === 'ANALYZE_TEXT') {
            const { text } = data;
            const analysis = ZeroWidthDetector.analyze(text);
            self.postMessage({ type: 'SUCCESS', id, result: { analysis } });

        } else if (action === 'SCAN_ZSTEG') {
            const { pixelBuffer, width, height, maxSampleBytes } = data;
            const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
            const findings = ZstegScanner.scan(imageData, {
                maxSampleBytes: maxSampleBytes || 2048,
                onProgress: (percent, currentCombo, foundCount) => {
                    sendProgress(id, percent, `${currentCombo} taranıyor... (${foundCount} bulgu)`);
                }
            });
            self.postMessage(
                { type: 'SUCCESS', id, result: { findings, pixelBuffer, width, height } },
                [pixelBuffer]
            );

        } else if (action === 'EXTRACT_ZSTEG_PAYLOAD') {
            const { pixelBuffer, width, height, comboId, maxBytes } = data;
            const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
            const payload = ZstegScanner.extractPayload(imageData, comboId, maxBytes || 1048576);
            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        payloadBuffer: payload.buffer,
                        pixelBuffer,
                        comboId
                    }
                },
                [payload.buffer, pixelBuffer]
            );

        } else {
            throw new Error(`Bilinmeyen iş parçacığı eylemi: ${action}`);
        }

    } catch (err: any) {
        self.postMessage({
            type: 'ERROR',
            id,
            error: err.message || String(err)
        } as WorkerResponse);
    } finally {
        // Best-effort memory zeroization: İş parçacığı tamponlarını ve parola referanslarını sıfırla
        if (data) {
            if (data.rawBuffer instanceof ArrayBuffer) new Uint8Array(data.rawBuffer).fill(0);
            if (data.rawDecoy instanceof ArrayBuffer) new Uint8Array(data.rawDecoy).fill(0);
            data.pass = null;
            data.passDecoy = null;
            data.password = null;
            data.rawBuffer = null;
            data.rawDecoy = null;
        }
    }
};
