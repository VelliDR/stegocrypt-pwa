/**
 * src/codec/QREngine.ts
 * İstemci taraflı Tip-Güvenli QR Kod Üretici ve Tarayıcı Motoru.
 * - qrcode-generator: Version 1-40, L/M/Q/H hata düzeltme, UTF-8 & Zero-Width tam desteği.
 * - jsQR: Kamera veya görselden sıfır sunucu, saf TypeScript QR kod çözücü.
 * - BarcodeDetector (Chromium): Donanım hızlandırmalı tarama, jsQR yedekleme.
 */

import qrcodeGenerator from 'qrcode-generator';
import jsQR from 'jsqr';
import type { SimpleImageData } from '../types/index.ts';
import { ImageEngine } from './ImageEngine.ts';

export type QRErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

export interface QRRenderOptions {
    level?: QRErrorCorrectionLevel;
    scale?: number;
    margin?: number;
}

export interface QRScanOptions {
    inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst';
}

interface QRCodeModel {
    addData(data: string, mode?: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
    createTableTag(cellSize?: number, margin?: number): string;
    createSvgTag(cellSize?: number, margin?: number): string;
    createImageTag(cellSize?: number, margin?: number): string;
}

type QRCodeFactory = {
    (typeNumber: number, errorCorrectionLevel: QRErrorCorrectionLevel): QRCodeModel;
    stringToBytes: (s: string) => number[];
};

const qrcode = qrcodeGenerator as unknown as QRCodeFactory;

// UTF-8 ve Sıfır Genişlikli (Zero-Width) karakterleri kayıpsız bayt dizisi olarak kodla
qrcode.stringToBytes = (s: string): number[] => {
    return Array.from(new TextEncoder().encode(s));
};

export const QREngine = {
    /**
     * QR kod maksimum güvenli bayt sınırı (~2300 bayt @ Level M).
     */
    MAX_QR_BYTES: 2300,

    /**
     * Verilen metin ve seviye için QRCode model nesnesi oluşturur.
     */
    createQR(text: string, level: QRErrorCorrectionLevel = 'M'): QRCodeModel {
        if (!text || typeof text !== 'string') {
            throw new Error("QR kod için geçerli bir metin girilmelidir.");
        }

        const byteLen = new TextEncoder().encode(text).length;
        if (byteLen > this.MAX_QR_BYTES) {
            throw new Error(`Veri çok büyük (${byteLen} bayt). QR kod standardı maksimum ~${this.MAX_QR_BYTES} bayt destekler. Lütfen görsel steganografi modunu kullanın.`);
        }

        // typeNumber = 0: Otomatik versiyon tespiti (Version 1-40)
        const qr = qrcode(0, level);
        qr.addData(text, 'Byte');
        qr.make();
        return qr;
    },

    /**
     * DOM / Canvas bağımsız ham piksel (SimpleImageData) üretir.
     * Hem tarayıcı hem de Node.js / Vitest test ortamlarında güvenle çalışır.
     */
    generateImageData(text: string, options: QRRenderOptions = {}): SimpleImageData {
        const level = options.level ?? 'M';
        const qr = this.createQR(text, level);

        const count = qr.getModuleCount();
        const margin = options.margin !== undefined ? options.margin : 4;
        const scale = options.scale ?? Math.max(3, Math.floor(320 / (count + margin * 2)));
        const totalSize = (count + margin * 2) * scale;

        const data = new Uint8ClampedArray(totalSize * totalSize * 4);
        // Beyaz arka plan
        data.fill(255);

        // Siyah modüller
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (qr.isDark(row, col)) {
                    const startX = (col + margin) * scale;
                    const startY = (row + margin) * scale;
                    for (let dy = 0; dy < scale; dy++) {
                        for (let dx = 0; dx < scale; dx++) {
                            const idx = ((startY + dy) * totalSize + (startX + dx)) * 4;
                            data[idx] = 0;       // R
                            data[idx + 1] = 0;   // G
                            data[idx + 2] = 0;   // B
                            data[idx + 3] = 255; // A
                        }
                    }
                }
            }
        }

        return {
            width: totalSize,
            height: totalSize,
            data
        };
    },

    /**
     * Metinden QR kod üretir ve verilen Canvas üzerine çizer.
     */
    renderToCanvas(canvas: HTMLCanvasElement, text: string, options: QRRenderOptions = {}): void {
        const imgData = this.generateImageData(text, options);
        canvas.width = imgData.width;
        canvas.height = imgData.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error("Canvas 2D bağlamı alınamadı.");
        }

        const nativeImgData = new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height);
        ctx.putImageData(nativeImgData, 0, 0);
    },

    /**
     * Metinden PNG DataURL üretir (İndirme ve paylaşma için).
     */
    toDataURL(text: string, options: QRRenderOptions = {}): string {
        if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            this.renderToCanvas(canvas, text, options);
            return canvas.toDataURL('image/png');
        }
        throw new Error("toDataURL yalnızca tarayıcı ortamında desteklenir.");
    },

    /**
     * ImageData içindeki QR kodu çözer (BarcodeDetector öncelikli, jsQR fallback).
     */
    async scanFromImageData(imageData: SimpleImageData, options: QRScanOptions = {}): Promise<string | null> {
        // 1. Tarayıcıda yerel donanım hızlandırmalı BarcodeDetector API varsa dene
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
            try {
                const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
                if (typeof ImageData !== 'undefined') {
                    const nativeImgData = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
                    const barcodes = await detector.detect(nativeImgData);
                    if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                        return barcodes[0].rawValue;
                    }
                }
            } catch {
                // BarcodeDetector başarısız olursa jsQR'a düş
            }
        }

        // 2. jsQR ile evrensel saf TypeScript çözümleme
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: options.inversionAttempts ?? "attemptBoth"
        });

        if (!code) return null;

        // UTF-8 ve çok baytlı karakterleri / sıfır genişlikli karakterleri kayıpsız aç
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
     * Bir görsel dosyasından (PNG/JPEG/WEBP vb.) QR kodu okur.
     */
    async scanFromFile(file: File | Blob, options: QRScanOptions = {}): Promise<string | null> {
        const imageData = await ImageEngine.loadImageData(file);
        return await this.scanFromImageData(imageData, options);
    }
};
