/**
 * QREngine.js
 * İstemci taraflı QR Kod Üretici ve Tarayıcı Motoru
 * - qrcode-generator: Version 1-40, L/M/Q/H hata düzeltme, UTF-8 & Zero-Width tam desteği
 * - jsQR: Kamera veya görselden sıfır sunucu QR kod çözücü
 */

import qrcode from './vendor/qrcode.mjs';

// UTF-8 ve Sıfır Genişlikli (Zero-Width) karakterleri kayıpsız bayt olarak kodla
qrcode.stringToBytes = function(s) {
    return Array.from(new TextEncoder().encode(s));
};

let jsQRLoaderPromise = null;

async function ensureJsQR() {
    if (typeof window !== 'undefined' && window.jsQR) {
        return window.jsQR;
    }
    if (jsQRLoaderPromise) return jsQRLoaderPromise;

    jsQRLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = './js/vendor/jsQR.js';
        script.onload = () => {
            if (window.jsQR) resolve(window.jsQR);
            else reject(new Error("jsQR başlatılamadı."));
        };
        script.onerror = () => reject(new Error("jsQR kütüphanesi yüklenemedi."));
        document.head.appendChild(script);
    });
    return jsQRLoaderPromise;
}

export const QREngine = {
    /**
     * QR kod maksimum güvenli bayt sınırı (~2300 bayt @ Level M).
     */
    MAX_QR_BYTES: 2300,

    /**
     * Metinden QR kod üretir ve verilen Canvas üzerine keskin piksellerle çizer.
     * @param {HTMLCanvasElement} canvas
     * @param {string} text
     * @param {{ level?: 'L'|'M'|'Q'|'H', scale?: number, margin?: number }} [options]
     * @returns {void}
     */
    renderToCanvas(canvas, text, options = {}) {
        if (!text || typeof text !== 'string') {
            throw new Error("QR kod için geçerli bir metin girilmelidir.");
        }

        const encoder = new TextEncoder();
        const byteLen = encoder.encode(text).length;
        if (byteLen > this.MAX_QR_BYTES) {
            throw new Error(`Veri çok büyük (${byteLen} bayt). QR kod standardı maksimum ~${this.MAX_QR_BYTES} bayt destekler. Lütfen görsel steganografi modunu kullanın.`);
        }

        const level = options.level || 'M';
        const qr = qrcode(0, level);
        qr.addData(text);
        qr.make();

        const count = qr.getModuleCount();
        const margin = options.margin !== undefined ? options.margin : 4;
        const scale = options.scale || Math.max(3, Math.floor(320 / (count + margin * 2)));
        const totalSize = (count + margin * 2) * scale;

        canvas.width = totalSize;
        canvas.height = totalSize;
        const ctx = canvas.getContext('2d');

        // Beyaz arka plan
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, totalSize, totalSize);

        // Siyah modüller
        ctx.fillStyle = '#000000';
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(
                        (col + margin) * scale,
                        (row + margin) * scale,
                        scale,
                        scale
                    );
                }
            }
        }
    },

    /**
     * Metinden DataURL üretir (İndirme ve paylaşma için).
     * @param {string} text
     * @param {{ level?: 'L'|'M'|'Q'|'H' }} [options]
     * @returns {string}
     */
    toDataURL(text, options = {}) {
        const offscreenCanvas = document.createElement('canvas');
        this.renderToCanvas(offscreenCanvas, text, options);
        return offscreenCanvas.toDataURL('image/png');
    },

    /**
     * ImageData içindeki QR kodu çözer (jsQR motoru).
     * @param {ImageData} imageData
     * @returns {Promise<string|null>}
     */
    async scanFromImageData(imageData) {
        const decoder = await ensureJsQR();
        const code = decoder(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth"
        });
        if (!code) return null;
        if (code.binaryData && code.binaryData.length > 0) {
            try {
                return new TextDecoder('utf-8').decode(new Uint8Array(code.binaryData));
            } catch {
                return code.data;
            }
        }
        return code.data;
    },

    /**
     * Bir görsel dosyasından (PNG/JPG vb.) QR kodu okur.
     * @param {File|Blob} file
     * @returns {Promise<string|null>}
     */
    async scanFromFile(file) {
        const url = URL.createObjectURL(file);
        try {
            const img = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error("QR görseli yüklenemedi."));
                image.src = url;
            });

            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            return await this.scanFromImageData(imgData);
        } finally {
            URL.revokeObjectURL(url);
        }
    }
};
