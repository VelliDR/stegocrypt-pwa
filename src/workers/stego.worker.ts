/**
 * src/workers/stego.worker.ts
 * Dedicated Web Worker Pipeline: KDF, AES-GCM, Argon2id, Steganografi ve Adli Bilişim İş Parçacığı.
 * Transferable Objects ile sıfır-kopyalama ($O(0)$ RAM transferi).
 */

import { StegoEngine } from '../stego/StegoEngine.ts';
import { AdaptiveEngine } from '../stego/AdaptiveEngine.ts';
import { PngCodec } from '../codec/PngCodec.ts';
import { SteganalysisEngine } from '../forensics/SteganalysisEngine.ts';
import { BinaryInspector } from '../forensics/BinaryInspector.ts';
import { DiffEngine } from '../forensics/DiffEngine.ts';
import { ZeroWidthDetector } from '../forensics/ZeroWidthDetector.ts';
import { ZstegScanner } from '../forensics/ZstegScanner.ts';
import { runEncryptPipeline } from './encryptPipeline.ts';
import type { WorkerRequest, WorkerResponse } from '../types/index.ts';

function sendProgress(id: string, percent: number, text: string): void {
    self.postMessage({ type: 'PROGRESS', id, percent, text } as WorkerResponse);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>): Promise<void> => {
    const { action, id, data } = e.data;

    try {
        if (action === 'ENCRYPT_V3') {
            const result = await runEncryptPipeline(data, (percent, text) => {
                sendProgress(id, percent, text);
            });
            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result
                },
                [result.pngBytes, result.pixelBuffer]
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

        } else if (action === 'RENDER_AMPLIFIED_DIFF') {
            const { pixelBuffer1, pixelBuffer2, width, height, amplifier } = data;
            const img1 = { width, height, data: new Uint8ClampedArray(pixelBuffer1) };
            const img2 = { width, height, data: new Uint8ClampedArray(pixelBuffer2) };
            const ampDiff = DiffEngine.renderAmplifiedDiff(img1, img2, amplifier || 20);
            self.postMessage(
                {
                    type: 'SUCCESS',
                    id,
                    result: {
                        ampDiffBuffer: ampDiff.data.buffer,
                        pixelBuffer1,
                        pixelBuffer2,
                        width,
                        height
                    }
                },
                [ampDiff.data.buffer, pixelBuffer1, pixelBuffer2]
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
