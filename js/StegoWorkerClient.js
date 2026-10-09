/**
 * js/StegoWorkerClient.js (Faz 2: Web Worker İstemcisi & Sıfır-Kopyalama Pipeline)
 * - workers/stego.worker.js ile arka plan iletişimini yönetir.
 * - Transferable Objects ile sıfır-kopyalama bellek aktarımı sağlar.
 * - Worker desteklenmediğinde veya kısıtlı ortamlarda otomatik main-thread fallback uygular.
 */
import { CryptoEngine } from './CryptoEngine.js';
import { StegoEngine } from './StegoEngine.js';
import { SteganalysisEngine } from './SteganalysisEngine.js';
import { PngCodec } from './png/PngCodec.js';

class StegoWorkerClientManager {
    constructor() {
        this.worker = null;
        this.workerFailed = false;
        this.requestId = 0;
        this.pending = new Map();
    }

    _getWorker() {
        if (this.workerFailed) return null;
        if (this.worker) return this.worker;

        if (typeof Worker === 'undefined') {
            this.workerFailed = true;
            return null;
        }

        try {
            // URL ve type: module ile modern web worker başlat
            const workerUrl = new URL('../workers/stego.worker.js', import.meta.url);
            this.worker = new Worker(workerUrl, { type: 'module' });

            this.worker.onmessage = (e) => {
                const msg = e.data;
                if (!msg || !msg.id) return;

                const req = this.pending.get(msg.id);
                if (!req) return;

                if (msg.type === 'PROGRESS') {
                    if (req.onProgress) req.onProgress(msg.percent, msg.text);
                    return;
                }

                if (msg.type === 'SUCCESS') {
                    this.pending.delete(msg.id);
                    req.resolve(msg.result);
                    return;
                }

                if (msg.type === 'ERROR') {
                    this.pending.delete(msg.id);
                    req.reject(new Error(msg.error));
                    return;
                }
            };

            this.worker.onerror = (err) => {
                console.warn("Stego Worker hatası, ana iş parçacığına geri dönülüyor:", err);
                this.workerFailed = true;
                // Bekleyen istekleri reddet
                for (const [id, req] of this.pending.entries()) {
                    req.reject(new Error("Worker başlatılamadı veya çöktü."));
                }
                this.pending.clear();
            };

            return this.worker;
        } catch (err) {
            console.warn("Worker başlatılamadı, doğrudan ana iş parçacığı kullanılacak:", err);
            this.workerFailed = true;
            return null;
        }
    }

    _send(action, data, transferList = [], onProgress = null) {
        const worker = this._getWorker();
        if (!worker) return null; // Fallback sinyali

        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            this.pending.set(id, { resolve, reject, onProgress });
            try {
                worker.postMessage({ action, id, data }, transferList);
            } catch (err) {
                this.pending.delete(id);
                reject(err);
            }
        });
    }

    /**
     * Format v3 Şifreleme ve Gömme (Dedicated Worker veya Fallback)
     */
    async encryptV3({
        pixelBuffer,
        width,
        height,
        rawBuffer,
        pass,
        lsbMode,
        isDeniable = false,
        rawDecoy = null,
        passDecoy = null,
        method = 'matching',
        onProgress = null
    }) {
        // Transferable için kopya al (orijinal tampon korunabilsin)
        const workerBuffer = pixelBuffer.slice(0);
        const transferList = [workerBuffer];

        const workerPromise = this._send(
            'ENCRYPT_V3',
            {
                pixelBuffer: workerBuffer,
                width,
                height,
                rawBuffer: Array.from(rawBuffer),
                pass,
                lsbMode,
                isDeniable,
                rawDecoy: rawDecoy ? Array.from(rawDecoy) : null,
                passDecoy,
                method
            },
            transferList,
            onProgress
        );

        if (workerPromise) {
            return await workerPromise;
        }

        // --- FALLBACK (Ana İş Parçacığı) ---
        if (onProgress) onProgress(10, "Ana iş parçacığında Format v3 hazırlanıyor...");
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(pixelBuffer.slice(0))
        };
        const sharedSalt = crypto.getRandomValues(new Uint8Array(16));

        if (isDeniable && rawDecoy && passDecoy) {
            if (onProgress) onProgress(20, "1/4: Tuzak katman anahtarı türetiliyor (600.000 PBKDF2)...");
            const masterDecoy = await CryptoEngine.deriveMasterKeyV3(passDecoy, sharedSalt, 600000);
            const subkeysDecoy = await CryptoEngine.deriveSubkeysV3(masterDecoy, 'v3/even');

            if (onProgress) onProgress(40, `2/4: Tuzak katman şifreleniyor (${method} ile even kanallarına)...`);
            const encDecoy = await CryptoEngine.encryptV3(new Uint8Array(rawDecoy), subkeysDecoy.metaKey, subkeysDecoy.bodyKey, lsbMode);
            StegoEngine.embedV3(imageData, encDecoy.header48, encDecoy.cipherBody, lsbMode, subkeysDecoy.scatterBits, sharedSalt, 'even', method);

            if (onProgress) onProgress(60, "3/4: Gerçek katman anahtarı türetiliyor (600.000 PBKDF2)...");
            const masterReal = await CryptoEngine.deriveMasterKeyV3(pass, sharedSalt, 600000);
            const subkeysReal = await CryptoEngine.deriveSubkeysV3(masterReal, 'v3/odd');

            if (onProgress) onProgress(80, `4/4: Gerçek katman şifreleniyor (${method} ile odd kanallarına)...`);
            const encReal = await CryptoEngine.encryptV3(new Uint8Array(rawBuffer), subkeysReal.metaKey, subkeysReal.bodyKey, lsbMode);
            StegoEngine.embedV3(imageData, encReal.header48, encReal.cipherBody, lsbMode, subkeysReal.scatterBits, null, 'odd', method);
        } else {
            if (onProgress) onProgress(25, "1/3: Master anahtar türetiliyor (600.000 PBKDF2)...");
            const masterKey = await CryptoEngine.deriveMasterKeyV3(pass, sharedSalt, 600000);
            const subkeys = await CryptoEngine.deriveSubkeysV3(masterKey, 'v3/all');

            if (onProgress) onProgress(50, "2/3: Veri şifreleniyor (AES-256-GCM)...");
            const enc = await CryptoEngine.encryptV3(new Uint8Array(rawBuffer), subkeys.metaKey, subkeys.bodyKey, lsbMode);

            if (onProgress) onProgress(75, `3/3: Piksellere dağıtılıyor (Format v3, ${method})...`);
            StegoEngine.embedV3(imageData, enc.header48, enc.cipherBody, lsbMode, subkeys.scatterBits, sharedSalt, 'all', method);
        }

        if (onProgress) onProgress(90, "PNG kodlanıyor (saf deterministik codec)...");
        const pngBytes = await PngCodec.encode({ width, height, data: imageData.data });

        if (onProgress) onProgress(100, "Tamamlandı!");
        return {
            pngBytes: pngBytes.buffer,
            pixelBuffer: imageData.data.buffer,
            width,
            height
        };
    }

    /**
     * Otomatik Çıkarıcı (Format v3 -> v2 -> v1)
     */
    async decryptAuto({ pixelBuffer, width, height, password, onProgress = null }) {
        const workerBuffer = pixelBuffer.slice(0);
        const transferList = [workerBuffer];

        const workerPromise = this._send(
            'DECRYPT_AUTO',
            { pixelBuffer: workerBuffer, width, height, password },
            transferList,
            onProgress
        );

        if (workerPromise) {
            const res = await workerPromise;
            return new Uint8Array(res.decryptedBytes);
        }

        // Fallback
        if (onProgress) onProgress(30, "Şifreli veri aranıyor (Format v3/v2/v1)...");
        const imageData = {
            width,
            height,
            data: new Uint8ClampedArray(pixelBuffer)
        };
        return await StegoEngine.extractAuto(imageData, password);
    }

    /**
     * χ² Steganaliz
     */
    async analyzeChiSquare({ pixelBuffer, width, height, onProgress = null }) {
        const workerBuffer = pixelBuffer.slice(0);
        const transferList = [workerBuffer];

        const workerPromise = this._send(
            'ANALYZE_CHI_SQUARE',
            { pixelBuffer: workerBuffer, width, height },
            transferList,
            onProgress
        );

        if (workerPromise) {
            const res = await workerPromise;
            return res.analysis;
        }

        const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
        return SteganalysisEngine.analyzeChiSquare(imageData);
    }

    /**
     * Bit Düzlemi Çıkarma
     */
    async renderBitPlane({ pixelBuffer, width, height, channel, bitDepth }) {
        const workerBuffer = pixelBuffer.slice(0);
        const transferList = [workerBuffer];

        const workerPromise = this._send(
            'RENDER_BIT_PLANE',
            { pixelBuffer: workerBuffer, width, height, channel, bitDepth },
            transferList
        );

        if (workerPromise) {
            const res = await workerPromise;
            return {
                width: res.width,
                height: res.height,
                data: new Uint8ClampedArray(res.bitPlaneBuffer)
            };
        }

        const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
        return SteganalysisEngine.renderBitPlane(imageData, channel, bitDepth);
    }

    /**
     * Fridrich RS Steganaliz
     */
    async analyzeRS({ pixelBuffer, width, height, channel = 'all', onProgress = null }) {
        const workerBuffer = pixelBuffer.slice(0);
        const transferList = [workerBuffer];

        const workerPromise = this._send(
            'ANALYZE_RS',
            { pixelBuffer: workerBuffer, width, height, channel },
            transferList,
            onProgress
        );

        if (workerPromise) {
            const res = await workerPromise;
            return res.rsResult;
        }

        const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
        return SteganalysisEngine.analyzeRS(imageData, channel);
    }

    /**
     * Kayan Pencere χ² Bölgesel Isı Haritası
     */
    async renderHeatmap({ pixelBuffer, width, height, blockSize = 32, onProgress = null }) {
        const workerBuffer = pixelBuffer.slice(0);
        const transferList = [workerBuffer];

        const workerPromise = this._send(
            'RENDER_HEATMAP',
            { pixelBuffer: workerBuffer, width, height, blockSize },
            transferList,
            onProgress
        );

        if (workerPromise) {
            const res = await workerPromise;
            return {
                width: res.width,
                height: res.height,
                data: new Uint8ClampedArray(res.heatmapBuffer)
            };
        }

        const imageData = { width, height, data: new Uint8ClampedArray(pixelBuffer) };
        return SteganalysisEngine.renderHeatmap(imageData, blockSize);
    }

    /**
     * Saf Deterministik PNG Ayrıştırma (Canvas Farbling Baypas)
     */
    async decodePng(fileBuffer) {
        const workerPromise = this._send(
            'PNG_DECODE',
            { fileBuffer: fileBuffer.slice(0) },
            []
        );

        if (workerPromise) {
            const res = await workerPromise;
            return {
                width: res.width,
                height: res.height,
                data: new Uint8ClampedArray(res.pixelBuffer)
            };
        }

        return await PngCodec.decode(fileBuffer);
    }
}

export const StegoWorkerClient = new StegoWorkerClientManager();
