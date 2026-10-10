/**
 * src/workers/StegoWorkerClient.ts
 * Web Worker İstemcisi.
 * UI ile arka plan Worker'ı arasında tip-güvenli, Promise tabanlı ve Transferable Object destekli köprü.
 */

import type { WorkerAction, WorkerResponse } from '../types/index.ts';

interface PendingRequest {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    onProgress?: ((percent: number, text: string) => void) | undefined;
}

let workerInstance: Worker | null = null;
const pendingRequests = new Map<string, PendingRequest>();

function getWorker(): Worker | null {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
        return null;
    }
    if (!workerInstance) {
        try {
            workerInstance = new Worker(new URL('./stego.worker.ts', import.meta.url), { type: 'module' });
            workerInstance.onmessage = (e: MessageEvent<WorkerResponse>) => {
                const msg = e.data;
                const req = pendingRequests.get(msg.id);
                if (!req) return;

                if (msg.type === 'PROGRESS') {
                    if (req.onProgress) req.onProgress(msg.percent, msg.text);
                } else if (msg.type === 'SUCCESS') {
                    pendingRequests.delete(msg.id);
                    req.resolve(msg.result);
                } else if (msg.type === 'ERROR') {
                    pendingRequests.delete(msg.id);
                    req.reject(new Error(msg.error));
                }
            };
            workerInstance.onerror = (err) => {
                console.error("Worker hatası:", err);
            };
        } catch (e) {
            console.warn("Worker başlatılamadı, yerel fallback kullanılacak:", e);
            workerInstance = null;
        }
    }
    return workerInstance;
}

export const StegoWorkerClient = {
    async execute<T = any>(
        action: WorkerAction,
        data: any,
        transferables: Transferable[] = [],
        onProgress?: (percent: number, text: string) => void
    ): Promise<T> {
        const worker = getWorker();
        const id = Math.random().toString(36).substring(2) + Date.now().toString(36);

        if (worker) {
            return new Promise<T>((resolve, reject) => {
                pendingRequests.set(id, { resolve, reject, onProgress });
                worker.postMessage({ id, action, data }, transferables);
            });
        }

        // Worker desteklenmeyen ortamlarda (örn. Node.js unit test) doğrudan yerel import ve yürütme
        return this.fallbackExecute<T>(action, data, onProgress);
    },

    async fallbackExecute<T = any>(
        action: WorkerAction,
        data: any,
        onProgress?: (percent: number, text: string) => void
    ): Promise<T> {
        if (action === 'ENCRYPT_V3') {
            const { KeyDerivation } = await import('../crypto/KeyDerivation.ts');
            const { CryptoEngine } = await import('../crypto/CryptoEngine.ts');
            const { StegoEngine } = await import('../stego/StegoEngine.ts');
            const { AdaptiveEngine } = await import('../stego/AdaptiveEngine.ts');
            const { PngCodec } = await import('../codec/PngCodec.ts');

            const { pixelBuffer, width, height, rawBuffer, pass, lsbMode, isDeniable, rawDecoy, passDecoy } = data;
            const method = data.method || 'matching';
            const distribution = data.distribution || 'adaptive';
            const kdfType = data.kdfType || 'pbkdf2';
            const kdfId = kdfType === 'argon2id' ? 0x02 : 0x01;
            const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
            const sharedSalt = crypto.getRandomValues(new Uint8Array(16));

            if (isDeniable && rawDecoy && passDecoy) {
                const kdfName = kdfType === 'argon2id' ? 'Argon2id Wasm 64MB' : '600.000 PBKDF2';
                if (onProgress) onProgress(20, `Tuzak katman anahtarı türetiliyor (${kdfName})...`);
                const masterDecoy = kdfType === 'argon2id'
                    ? await KeyDerivation.deriveMasterKeyArgon2id(passDecoy, sharedSalt)
                    : await KeyDerivation.deriveMasterKeyV3(passDecoy, sharedSalt, 600000);
                const subkeysDecoy = await KeyDerivation.deriveSubkeysV3(masterDecoy, 'v3/even');
                const encDecoy = await CryptoEngine.encryptV3(new Uint8Array(rawDecoy), subkeysDecoy.metaKey as CryptoKey, subkeysDecoy.bodyKey as CryptoKey, lsbMode, kdfId);
                if (distribution === 'adaptive') {
                    AdaptiveEngine.embedAdaptive(imageData, encDecoy.header48, encDecoy.cipherBody, lsbMode, subkeysDecoy.scatterBits, sharedSalt, 'even', method);
                } else {
                    StegoEngine.embedV3(imageData, encDecoy.header48, encDecoy.cipherBody, lsbMode, subkeysDecoy.scatterBits, sharedSalt, 'even', method);
                }

                if (onProgress) onProgress(60, `Gerçek katman anahtarı türetiliyor (${kdfName})...`);
                const masterReal = kdfType === 'argon2id'
                    ? await KeyDerivation.deriveMasterKeyArgon2id(pass, sharedSalt)
                    : await KeyDerivation.deriveMasterKeyV3(pass, sharedSalt, 600000);
                const subkeysReal = await KeyDerivation.deriveSubkeysV3(masterReal, 'v3/odd');
                const encReal = await CryptoEngine.encryptV3(new Uint8Array(rawBuffer), subkeysReal.metaKey as CryptoKey, subkeysReal.bodyKey as CryptoKey, lsbMode, kdfId);
                if (distribution === 'adaptive') {
                    AdaptiveEngine.embedAdaptive(imageData, encReal.header48, encReal.cipherBody, lsbMode, subkeysReal.scatterBits, null, 'odd', method);
                } else {
                    StegoEngine.embedV3(imageData, encReal.header48, encReal.cipherBody, lsbMode, subkeysReal.scatterBits, null, 'odd', method);
                }
            } else {
                const kdfName = kdfType === 'argon2id' ? 'Argon2id Wasm 64MB' : '600.000 PBKDF2';
                if (onProgress) onProgress(30, `Master anahtar türetiliyor (${kdfName})...`);
                const masterKey = kdfType === 'argon2id'
                    ? await KeyDerivation.deriveMasterKeyArgon2id(pass, sharedSalt)
                    : await KeyDerivation.deriveMasterKeyV3(pass, sharedSalt, 600000);
                const subkeys = await KeyDerivation.deriveSubkeysV3(masterKey, 'v3/all');
                const enc = await CryptoEngine.encryptV3(new Uint8Array(rawBuffer), subkeys.metaKey as CryptoKey, subkeys.bodyKey as CryptoKey, lsbMode, kdfId);
                if (distribution === 'adaptive') {
                    AdaptiveEngine.embedAdaptive(imageData, enc.header48, enc.cipherBody, lsbMode, subkeys.scatterBits, sharedSalt, 'all', method);
                } else {
                    StegoEngine.embedV3(imageData, enc.header48, enc.cipherBody, lsbMode, subkeys.scatterBits, sharedSalt, 'all', method);
                }
            }

            const pngBytes = await PngCodec.encode({ width, height, data: imageData.data });
            return {
                pngBytes: pngBytes.buffer,
                pixelBuffer: imageData.data.buffer,
                width,
                height
            } as T;
        }

        if (action === 'DECRYPT_AUTO') {
            const { StegoEngine } = await import('../stego/StegoEngine.ts');
            const { pixelBuffer, width, height, password } = data;
            const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
            const decryptedBytes = await StegoEngine.extractAuto(imageData, password);
            return {
                decryptedBytes: decryptedBytes.buffer,
                pixelBuffer: imageData.data.buffer
            } as T;
        }

        if (action === 'CALCULATE_RISK') {
            const { AdaptiveEngine } = await import('../stego/AdaptiveEngine.ts');
            const { pixelBuffer, width, height, payloadBytes, lsbMode } = data;
            const risk = AdaptiveEngine.calculateStegoRisk(payloadBytes, width, height, new Uint8ClampedArray(pixelBuffer), lsbMode || 1);
            return { risk, pixelBuffer } as T;
        }

        if (action === 'PNG_DECODE') {
            const { PngCodec } = await import('../codec/PngCodec.ts');
            const decoded = await PngCodec.decode(data.fileBuffer);
            return {
                width: decoded.width,
                height: decoded.height,
                pixelBuffer: decoded.data.buffer
            } as T;
        }

        if (action === 'ANALYZE_CHI_SQUARE') {
            const { SteganalysisEngine } = await import('../forensics/SteganalysisEngine.ts');
            const imageData = { width: data.width, height: data.height, data: new Uint8ClampedArray(data.pixelBuffer) };
            const analysis = SteganalysisEngine.analyzeChiSquare(imageData);
            return { analysis, pixelBuffer: imageData.data.buffer } as T;
        }

        if (action === 'ANALYZE_RS') {
            const { SteganalysisEngine } = await import('../forensics/SteganalysisEngine.ts');
            const imageData = { width: data.width, height: data.height, data: new Uint8ClampedArray(data.pixelBuffer) };
            const rsResult = SteganalysisEngine.analyzeRS(imageData, data.channel || 'all');
            return { rsResult, pixelBuffer: imageData.data.buffer } as T;
        }

        if (action === 'INSPECT_BINARY') {
            const { BinaryInspector } = await import('../forensics/BinaryInspector.ts');
            const report = BinaryInspector.inspect(data.fileBuffer);
            return { report, fileBuffer: data.fileBuffer } as T;
        }

        if (action === 'COMPARE_IMAGES') {
            const { DiffEngine } = await import('../forensics/DiffEngine.ts');
            const img1 = { width: data.width, height: data.height, data: new Uint8ClampedArray(data.pixelBuffer1) };
            const img2 = { width: data.width, height: data.height, data: new Uint8ClampedArray(data.pixelBuffer2) };
            const comparison = DiffEngine.compare(img1, img2);
            const ampDiff = DiffEngine.renderAmplifiedDiff(img1, img2, data.amplifier || 20);
            const lsbDiff = DiffEngine.renderLsbDiff(img1, img2);
            return {
                comparison,
                ampDiffBuffer: ampDiff.data.buffer,
                lsbDiffBuffer: lsbDiff.data.buffer,
                pixelBuffer1: data.pixelBuffer1,
                pixelBuffer2: data.pixelBuffer2,
                width: data.width,
                height: data.height
            } as T;
        }

        if (action === 'ANALYZE_TEXT') {
            const { ZeroWidthDetector } = await import('../forensics/ZeroWidthDetector.ts');
            const analysis = ZeroWidthDetector.analyze(data.text);
            return { analysis } as T;
        }

        if (action === 'SCAN_ZSTEG') {
            const { ZstegScanner } = await import('../forensics/ZstegScanner.ts');
            const imageData = { width: data.width, height: data.height, data: new Uint8ClampedArray(data.pixelBuffer) };
            const findings = ZstegScanner.scan(imageData, {
                maxSampleBytes: data.maxSampleBytes || 2048,
                onProgress: (percent, currentCombo, foundCount) => {
                    if (onProgress) onProgress(percent, `${currentCombo} taranıyor... (${foundCount} bulgu)`);
                }
            });
            return { findings, pixelBuffer: data.pixelBuffer, width: data.width, height: data.height } as T;
        }

        if (action === 'EXTRACT_ZSTEG_PAYLOAD') {
            const { ZstegScanner } = await import('../forensics/ZstegScanner.ts');
            const imageData = { width: data.width, height: data.height, data: new Uint8ClampedArray(data.pixelBuffer) };
            const payload = ZstegScanner.extractPayload(imageData, data.comboId, data.maxBytes || 1048576);
            return { payloadBuffer: payload.buffer, pixelBuffer: data.pixelBuffer, comboId: data.comboId } as T;
        }

        throw new Error(`Fallback desteklenmeyen eylem: ${action}`);
    }
};
