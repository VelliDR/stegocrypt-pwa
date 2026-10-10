/**
 * src/codec/ImageEngine.ts
 * Görsel yükleme, Canvas işleme, Alfa düzleştirme ve Taşıyıcı Kanal Güvenlik Denetimi.
 */

import type { CarrierSafetyReport, SimpleImageData } from '../types/index.ts';
import { PngCodec } from './PngCodec.ts';

export interface CanvasProcessResult {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    imageData: SimpleImageData;
    maxCapacityBytes1LSB: number;
    maxCapacityBytes2LSB: number;
}

export const ImageEngine = {
    /**
     * Görsel dosyasını (PNG/JPEG/WEBP) SimpleImageData yapısına yükler.
     * PNG dosyaları için doğrudan deterministik PngCodec çalıştırılarak tarayıcı canvas renk dönüşümü ve parmak izi gürültüsü önlenir.
     */
    async loadImageData(file: File | Blob): Promise<SimpleImageData> {
        try {
            const buf = await file.arrayBuffer();
            const u8 = new Uint8Array(buf);
            // PNG Dosya İmzası (Magic: 89 50 4E 47)
            if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) {
                const decoded = await PngCodec.decode(u8);
                // Alfa düzleştirme: Şeffaf piksellerin alfa kanalını 255'e sabitleyerek bozulmayı önle
                for (let i = 3; i < decoded.data.length; i += 4) {
                    decoded.data[i] = 255;
                }
                return decoded;
            }
        } catch {
            // Fallback to Canvas
        }

        return new Promise<SimpleImageData>((resolve, reject) => {
            if (typeof window === 'undefined' || typeof Image === 'undefined') {
                reject(new Error("Tarayıcı Image API mevcut değil."));
                return;
            }
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                try {
                    const res = ImageEngine.processToCanvas(img);
                    resolve(res.imageData);
                } catch (e) {
                    reject(e);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Görsel yüklenemedi veya desteklenmeyen format."));
            };
            img.src = url;
        });
    },
    /**
     * Taşıyıcı görsel kanal güvenliğini ve kayıplı sıkıştırma riskini denetler.
     */
    checkCarrierSafety(file: { name?: string; type?: string } | null): CarrierSafetyReport {
        if (!file) {
            return { isLossy: false, isSocialMedia: false, format: 'unknown', warning: null, recommendation: null };
        }

        const name = (file.name || '').toLowerCase();
        const type = (file.type || '').toLowerCase();

        const isJpeg = type === 'image/jpeg' || /\.(jpe?g)$/i.test(name);
        const isWebp = type === 'image/webp' || /\.webp$/i.test(name);
        const isSocial = /whatsapp|telegram|instagram|messenger|discord|signal|twitter|facebook|viber/i.test(name) ||
                         /img[-_]\d{8}[-_]wa\d+/i.test(name);

        if (isJpeg || isWebp) {
            const fmt = isJpeg ? 'JPEG' : 'WebP';
            return {
                isLossy: true,
                isSocialMedia: isSocial,
                format: fmt,
                warning: `Seçilen görsel kayıplı ${fmt} formatında. Kayıplı sıkıştırma pikselleri değiştirdiği için mekânsal LSB verilerini bozar; şifre çözülemeyebilir.`,
                recommendation: 'Lütfen şifreli orijinal, kayıpsız PNG dosyasını kullanın.'
            };
        }

        if (isSocial) {
            return {
                isLossy: false,
                isSocialMedia: true,
                format: 'PNG (Sosyal Medya İsimli)',
                warning: 'Görsel dosya adı bir sosyal medya veya mesajlaşma platformuna ait görünüyor. Eğer dosya "Fotoğraf" olarak iletildiyse sunucu tarafında kayıplı sıkıştırılmış olabilir.',
                recommendation: 'Şifre çözülemezse, göndericiden görseli "Belge / Dosya (Kayıpsız)" olarak tekrar iletmesini isteyin.'
            };
        }

        return {
            isLossy: false,
            isSocialMedia: false,
            format: type || 'image/png',
            warning: null,
            recommendation: null
        };
    },

    /**
     * Dosyanın HEIC/HEIF formatında olup olmadığını kontrol eder.
     */
    isHeicFile(file: { name?: string; type?: string } | null): boolean {
        if (!file) return false;
        const name = (file.name || '').toLowerCase();
        const type = (file.type || '').toLowerCase();
        return type === 'image/heic' || type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
    },

    /**
     * Görseli canvas'a aktarır ve alfa piksellerini 255'e sabitleyerek düzleştirir.
     */
    processToCanvas(img: HTMLImageElement, maxDim: number = 2560): CanvasProcessResult {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
            if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
            } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
        if (!ctx) throw new Error("Canvas context alınamadı.");

        // 1. Opak arka plan doldur
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // 2. Görseli çiz
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height);
        const d = imgData.data;

        // 3. Alfa kanallarını 255'e sabitle (Premultiplied alpha kaynaklı bozulmaları önler)
        for (let i = 3; i < d.length; i += 4) {
            d[i] = 255;
        }
        ctx.putImageData(imgData, 0, 0);

        const totalChannels = Math.floor((d.length / 4) * 3);
        const maxCapacityBytes1LSB = Math.max(0, Math.floor(totalChannels / 8) - 36);
        const maxCapacityBytes2LSB = Math.max(0, 36 + Math.floor(((totalChannels - 288) * 2) / 8) - 36);

        return {
            canvas,
            ctx,
            imageData: { width, height, data: d },
            maxCapacityBytes1LSB,
            maxCapacityBytes2LSB
        };
    },

    /**
     * Tarayıcı canvas farbling/gürültü korumasını denetler.
     */
    verifyCanvasIntegrity(): { ok: boolean; farblingDetected: boolean; reason?: string } {
        if (typeof document === 'undefined') return { ok: true, farblingDetected: false };

        try {
            const canvas = document.createElement('canvas');
            canvas.width = 8;
            canvas.height = 8;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return { ok: false, farblingDetected: false, reason: 'Canvas context alınamadı.' };

            const testData = ctx.createImageData(8, 8);
            for (let i = 0; i < testData.data.length; i += 4) {
                testData.data[i] = (i * 7) & 0xFF;
                testData.data[i + 1] = (i * 13) & 0xFF;
                testData.data[i + 2] = (i * 29) & 0xFF;
                testData.data[i + 3] = 255;
            }
            ctx.putImageData(testData, 0, 0);

            const readBack = ctx.getImageData(0, 0, 8, 8);
            for (let i = 0; i < testData.data.length; i++) {
                if (testData.data[i] !== readBack.data[i]) {
                    return {
                        ok: false,
                        farblingDetected: true,
                        reason: `Canvas farbling tespit edildi (${i}. bayt beklenen: ${testData.data[i]}, okunan: ${readBack.data[i]}).`
                    };
                }
            }
            return { ok: true, farblingDetected: false };
        } catch (e: any) {
            return { ok: false, farblingDetected: false, reason: e.message };
        }
    }
};
