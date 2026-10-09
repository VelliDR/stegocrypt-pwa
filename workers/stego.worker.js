/**
 * workers/stego.worker.js (Faz 2: Dedicated Web Worker Pipeline)
 * - KDF (600.000 PBKDF2), AES-GCM şifreleme/çözme, steganografi ve steganaliz iş parçacığı.
 * - Transferable Objects ile sıfır-kopyalama (zero-copy) bellek transferi.
 * - Ana UI thread'inde 60 FPS akıcılığı korur; tarayıcı donmalarını engeller.
 */

import { CryptoEngine } from '../js/CryptoEngine.js';
import { StegoEngine } from '../js/StegoEngine.js';
import { CompressionEngine } from '../js/CompressionEngine.js';
import { SteganalysisEngine } from '../js/SteganalysisEngine.js';
import { PngCodec } from '../js/png/PngCodec.js';
import { AdaptiveEngine } from '../js/AdaptiveEngine.js';

function sendProgress(id, percent, text) {
    self.postMessage({ type: 'PROGRESS', id, percent, text });
}

self.onmessage = async (e) => {
    const { action, id, data } = e.data;

    try {
        if (action === 'ENCRYPT_V3') {
            // data: { pixelBuffer, width, height, rawBuffer, pass, lsbMode, isDeniable, rawDecoy, passDecoy, method, distribution }
            const { pixelBuffer, width, height, rawBuffer, pass, lsbMode, isDeniable, rawDecoy, passDecoy } = data;
            const method = data.method || 'matching';
            const distribution = data.distribution || 'adaptive';
            const imageData = {
                width,
                height,
                data: new Uint8ClampedArray(pixelBuffer)
            };

            const sharedSalt = crypto.getRandomValues(new Uint8Array(16));

            if (isDeniable && rawDecoy && passDecoy) {
                // Çift Katmanlı İnkâr Modu
                sendProgress(id, 10, "1/4: Tuzak katman anahtarı türetiliyor (600.000 KDF)...");
                const masterDecoy = await CryptoEngine.deriveMasterKeyV3(passDecoy, sharedSalt, 600000);
                const subkeysDecoy = await CryptoEngine.deriveSubkeysV3(masterDecoy, 'v3/even');

                sendProgress(id, 30, `2/4: Tuzak katman şifreleniyor (${method}, ${distribution})...`);
                const encDecoy = await CryptoEngine.encryptV3(new Uint8Array(rawDecoy), subkeysDecoy.metaKey, subkeysDecoy.bodyKey, lsbMode);
                if (distribution === 'adaptive') {
                    AdaptiveEngine.embedAdaptive(imageData, encDecoy.header48, encDecoy.cipherBody, lsbMode, subkeysDecoy.scatterBits, sharedSalt, 'even', method);
                } else {
                    StegoEngine.embedV3(imageData, encDecoy.header48, encDecoy.cipherBody, lsbMode, subkeysDecoy.scatterBits, sharedSalt, 'even', method);
                }

                sendProgress(id, 50, "3/4: Gerçek katman anahtarı türetiliyor (600.000 KDF)...");
                const masterReal = await CryptoEngine.deriveMasterKeyV3(pass, sharedSalt, 600000);
                const subkeysReal = await CryptoEngine.deriveSubkeysV3(masterReal, 'v3/odd');

                sendProgress(id, 75, `4/4: Gerçek katman şifreleniyor (${method}, ${distribution})...`);
                const encReal = await CryptoEngine.encryptV3(new Uint8Array(rawBuffer), subkeysReal.metaKey, subkeysReal.bodyKey, lsbMode);
                if (distribution === 'adaptive') {
                    AdaptiveEngine.embedAdaptive(imageData, encReal.header48, encReal.cipherBody, lsbMode, subkeysReal.scatterBits, null, 'odd', method);
                } else {
                    StegoEngine.embedV3(imageData, encReal.header48, encReal.cipherBody, lsbMode, subkeysReal.scatterBits, null, 'odd', method);
                }
            } else {
                // Tekil Mod (v3/all)
                sendProgress(id, 20, "1/3: Master anahtar türetiliyor (600.000 PBKDF2)...");
                const masterKey = await CryptoEngine.deriveMasterKeyV3(pass, sharedSalt, 600000);
                const subkeys = await CryptoEngine.deriveSubkeysV3(masterKey, 'v3/all');

                sendProgress(id, 50, "2/3: Veri şifreleniyor (AES-256-GCM)...");
                const enc = await CryptoEngine.encryptV3(new Uint8Array(rawBuffer), subkeys.metaKey, subkeys.bodyKey, lsbMode);

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
            // data: { pixelBuffer, width, height, password }
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
            // data: { pixelBuffer, width, height }
            const { pixelBuffer, width, height } = data;
            const imageData = {
                width,
                height,
                data: new Uint8ClampedArray(pixelBuffer)
            };

            sendProgress(id, 50, "Piksel çiftleri histogramı çıkarılıyor ve χ² hesaplanıyor...");
            const analysis = SteganalysisEngine.analyzeChiSquare(imageData);

            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        analysis,
                        pixelBuffer: imageData.data.buffer
                    }
                },
                [imageData.data.buffer]
            );

        } else if (action === 'RENDER_BIT_PLANE') {
            // data: { pixelBuffer, width, height, channel, bitDepth }
            const { pixelBuffer, width, height, channel, bitDepth } = data;
            const imageData = {
                width,
                height,
                data: new Uint8ClampedArray(pixelBuffer)
            };

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
            // data: { pixelBuffer, width, height, channel }
            const { pixelBuffer, width, height, channel } = data;
            const imageData = {
                width,
                height,
                data: new Uint8ClampedArray(pixelBuffer)
            };

            sendProgress(id, 50, "Piksel grupları ve RS analizi (Fridrich) hesaplanıyor...");
            const rsResult = SteganalysisEngine.analyzeRS(imageData, channel || 'all');

            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        rsResult,
                        pixelBuffer: imageData.data.buffer
                    }
                },
                [imageData.data.buffer]
            );

        } else if (action === 'RENDER_HEATMAP') {
            // data: { pixelBuffer, width, height, blockSize }
            const { pixelBuffer, width, height, blockSize } = data;
            const imageData = {
                width,
                height,
                data: new Uint8ClampedArray(pixelBuffer)
            };

            sendProgress(id, 50, "Bölgesel χ² ısı haritası hesaplanıyor...");
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
            // data: { fileBuffer }
            const { fileBuffer } = data;
            sendProgress(id, 40, "PNG ayrıştırılıyor...");
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
            // data: { pixelBuffer, width, height, payloadBytes, lsbMode }
            const { pixelBuffer, width, height, payloadBytes, lsbMode } = data;
            const risk = AdaptiveEngine.calculateStegoRisk(
                payloadBytes,
                width,
                height,
                new Uint8ClampedArray(pixelBuffer),
                lsbMode || 1
            );

            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        risk,
                        pixelBuffer
                    }
                },
                [pixelBuffer]
            );

        } else {
            throw new Error(`Bilinmeyen iş parçacığı eylemi: ${action}`);
        }

    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            id,
            error: err.message || String(err)
        });
    }
};
