/**
 * src/forensics/DiffEngine.ts
 * Görsel Fark ve Bozulma Analiz Motoru.
 * - MSE (Mean Squared Error).
 * - PSNR (Peak Signal-to-Noise Ratio).
 * - SSIM (Structural Similarity Index - 8x8 Kayar Pencere).
 * - Büyütülmüş Fark Haritası ($k \times$) ve Altın Sarısı LSB Değişim Düzlemi.
 */

import type { DiffComparison, SimpleImageData } from '../types/index.ts';

export const DiffEngine = {
    compare(img1: SimpleImageData, img2: SimpleImageData): DiffComparison {
        if (img1.width !== img2.width || img1.height !== img2.height) {
            throw new Error(`Görsel boyutları uyuşmuyor (${img1.width}×${img1.height} vs ${img2.width}×${img2.height}).`);
        }

        const d1 = img1.data;
        const d2 = img2.data;
        const totalPixels = img1.width * img1.height;
        let sumSquaredError = 0;
        let maxDiff = 0;
        let changedPixels = 0;

        for (let i = 0; i < d1.length; i += 4) {
            let pixelChanged = false;
            for (let c = 0; c < 3; c++) {
                const diff = Math.abs(d1[i + c]! - d2[i + c]!);
                if (diff > 0) {
                    sumSquaredError += diff * diff;
                    pixelChanged = true;
                    if (diff > maxDiff) maxDiff = diff;
                }
            }
            if (pixelChanged) changedPixels++;
        }

        const mse = sumSquaredError / (totalPixels * 3);
        let psnr = Infinity;
        if (mse > 0) {
            psnr = 10 * Math.log10((255 * 255) / mse);
        }

        const ssim = this.computeSSIM(img1, img2);

        return {
            mse: Math.round(mse * 1000) / 1000,
            psnr: psnr === Infinity ? Infinity : Math.round(psnr * 100) / 100,
            ssim: Math.round(ssim * 10000) / 10000,
            maxDiff,
            changedPixels,
            changedPercent: Math.round((changedPixels / totalPixels) * 10000) / 100
        };
    },

    computeSSIM(img1: SimpleImageData, img2: SimpleImageData, windowSize: number = 8): number {
        const { width, height } = img1;
        const d1 = img1.data;
        const d2 = img2.data;

        const c1 = (0.01 * 255) ** 2;
        const c2 = (0.03 * 255) ** 2;

        let totalSsim = 0;
        let numWindows = 0;

        for (let y = 0; y <= height - windowSize; y += windowSize) {
            for (let x = 0; x <= width - windowSize; x += windowSize) {
                let mean1 = 0, mean2 = 0;
                const n = windowSize * windowSize * 3;

                for (let wy = 0; wy < windowSize; wy++) {
                    for (let wx = 0; wx < windowSize; wx++) {
                        const idx = ((y + wy) * width + (x + wx)) * 4;
                        mean1 += d1[idx]! + d1[idx + 1]! + d1[idx + 2]!;
                        mean2 += d2[idx]! + d2[idx + 1]! + d2[idx + 2]!;
                    }
                }
                mean1 /= n;
                mean2 /= n;

                let var1 = 0, var2 = 0, covar = 0;
                for (let wy = 0; wy < windowSize; wy++) {
                    for (let wx = 0; wx < windowSize; wx++) {
                        const idx = ((y + wy) * width + (x + wx)) * 4;
                        for (let c = 0; c < 3; c++) {
                            const v1 = d1[idx + c]! - mean1;
                            const v2 = d2[idx + c]! - mean2;
                            var1 += v1 * v1;
                            var2 += v2 * v2;
                            covar += v1 * v2;
                        }
                    }
                }
                var1 /= (n - 1);
                var2 /= (n - 1);
                covar /= (n - 1);

                const windowSsim = ((2 * mean1 * mean2 + c1) * (2 * covar + c2)) /
                    ((mean1 * mean1 + mean2 * mean2 + c1) * (var1 + var2 + c2));

                totalSsim += windowSsim;
                numWindows++;
            }
        }

        return numWindows > 0 ? totalSsim / numWindows : 1.0;
    },

    renderAmplifiedDiff(img1: SimpleImageData, img2: SimpleImageData, amplifier: number = 20): SimpleImageData {
        const { width, height } = img1;
        const d1 = img1.data;
        const d2 = img2.data;
        const out = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < d1.length; i += 4) {
            const diffR = Math.min(255, Math.abs(d1[i]! - d2[i]!) * amplifier);
            const diffG = Math.min(255, Math.abs(d1[i + 1]! - d2[i + 1]!) * amplifier);
            const diffB = Math.min(255, Math.abs(d1[i + 2]! - d2[i + 2]!) * amplifier);

            out[i] = diffR;
            out[i + 1] = diffG;
            out[i + 2] = diffB;
            out[i + 3] = 255;
        }

        return { width, height, data: out };
    },

    renderLsbDiff(img1: SimpleImageData, img2: SimpleImageData): SimpleImageData {
        const { width, height } = img1;
        const d1 = img1.data;
        const d2 = img2.data;
        const out = new Uint8ClampedArray(width * height * 4);

        for (let i = 0; i < d1.length; i += 4) {
            const lsb1 = (d1[i]! & 1) | ((d1[i + 1]! & 1) << 1) | ((d1[i + 2]! & 1) << 2);
            const lsb2 = (d2[i]! & 1) | ((d2[i + 1]! & 1) << 1) | ((d2[i + 2]! & 1) << 2);

            if (lsb1 !== lsb2) {
                out[i] = 255;   // Gold (#FFD700)
                out[i + 1] = 215;
                out[i + 2] = 0;
            } else {
                out[i] = 20;
                out[i + 1] = 20;
                out[i + 2] = 20;
            }
            out[i + 3] = 255;
        }

        return { width, height, data: out };
    }
};
