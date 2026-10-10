/**
 * src/forensics/SteganalysisEngine.ts
 * İleri Düzey Steganaliz Laboratuvarı:
 * - χ² (Chi-Square) Değer Çiftleri (Pairs of Values - PoVs) Testi.
 * - Fridrich RS (Regular/Singular) Steganaliz Algoritması.
 * - 8 Bit Düzlemi Görselleştiricisi ve Bölgesel χ² Isı Haritası.
 */

import type { ChiSquareAnalysis, RSAnalysisResult, SimpleImageData } from '../types/index.ts';

function normalCDF(z: number): number {
    const p = 0.3275911;
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * erf);
}

export const SteganalysisEngine = {
    /**
     * χ² (Chi-Square) PoVs testi (Wilson-Hilferty normalleştirilmiş istatistiksel olasılık hesabı).
     */
    analyzeChiSquare(imageData: SimpleImageData): ChiSquareAnalysis {
        const data = imageData.data;
        const totalPixels = imageData.width * imageData.height;

        if (totalPixels < 64) {
            return {
                chiSquare: 0,
                pValue: 1,
                probability: 0,
                isStego: false,
                degreesOfFreedom: 127,
                verdict: "Görsel analiz için çok küçük."
            };
        }

        const hist = new Uint32Array(256);
        for (let i = 0; i < data.length; i += 4) {
            hist[data[i]!]!++;
            hist[data[i + 1]!]!++;
            hist[data[i + 2]!]!++;
        }

        let chiSquare = 0;
        let k = 0;
        for (let i = 0; i < 256; i += 2) {
            const obsEven = hist[i]!;
            const obsOdd = hist[i + 1]!;
            const totalPair = obsEven + obsOdd;

            if (totalPair >= 10) {
                const exp = totalPair / 2;
                chiSquare += ((obsEven - exp) ** 2) / exp + ((obsOdd - exp) ** 2) / exp;
                k++;
            }
        }

        const dof = Math.max(1, k - 1);
        const safeChiSquare = Math.max(0, chiSquare);
        const z = (Math.pow(safeChiSquare / dof, 1 / 3) - (1 - 2 / (9 * dof))) / Math.sqrt(2 / (9 * dof));
        const cdf = normalCDF(z);
        const pValue = Math.max(0, Math.min(1, 1 - cdf));

        // Stego güven skoru: z <= 2.5 için yüksek olasılık, z > 5 için %0
        const probability = Math.max(0, Math.min(100, 100 / (1 + Math.exp((z - 2.5) * 1.5))));
        const isStego = probability >= 65;

        let verdict = "Temiz / Doğal Görsel";
        if (probability >= 70) {
            verdict = "⚠️ Yüksek Olasılıkla LSB Şifreli Veri İçeriyor";
        } else if (probability >= 30) {
            verdict = "🔍 Şüpheli LSB Örüntüsü";
        }

        return {
            chiSquare: Math.round(safeChiSquare * 100) / 100,
            pValue: Math.round(pValue * 1000) / 1000,
            probability: Math.round(probability * 10) / 10,
            isStego,
            degreesOfFreedom: dof,
            verdict
        };
    },

    /**
     * Fridrich RS Steganaliz Algoritması (Horizontal Quadruplet + Quadratic Solver).
     * LSB Replacement kaynaklı R/S simetri bozulmasını ölçerek tahmini gömme oranını (p) hesaplar.
     */
    analyzeRS(imageData: SimpleImageData, channel: 'r' | 'g' | 'b' | 'all' = 'all'): RSAnalysisResult {
        const { width, height, data } = imageData;
        const totalPixels = width * height;

        function F1(x: number): number { return x ^ 1; }
        function Fm1(x: number): number { return (x & 1) ? x + 1 : x - 1; }

        function calculateChannel(channelOffset: number, stride: number = 4) {
            const numGroups = Math.floor(totalPixels / 4);
            if (numGroups < 16) {
                return { p: 0, rM: 0, sM: 0, r_M: 0, s_M: 0, d0: 0, dm0: 0, d1: 0, dm1: 0 };
            }

            let R = 0, S = 0;
            let Rm = 0, Sm = 0;

            for (let g = 0; g < numGroups; g++) {
                const base = (g * 4) * stride + channelOffset;
                const x0 = data[base]!;
                const x1 = data[base + stride]!;
                const x2 = data[base + stride * 2]!;
                const x3 = data[base + stride * 3]!;

                const v = Math.abs(x0 - x1) + Math.abs(x1 - x2) + Math.abs(x2 - x3);

                // Mask M: [0, 1, 1, 0]
                const fx1 = F1(x1);
                const fx2 = F1(x2);
                const vM = Math.abs(x0 - fx1) + Math.abs(fx1 - fx2) + Math.abs(fx2 - x3);
                if (vM > v) R++;
                else if (vM < v) S++;

                // Mask -M: [0, -1, -1, 0]
                const fmx1 = Fm1(x1);
                const fmx2 = Fm1(x2);
                const v_M = Math.abs(x0 - fmx1) + Math.abs(fmx1 - fmx2) + Math.abs(fmx2 - x3);
                if (v_M > v) Rm++;
                else if (v_M < v) Sm++;
            }

            // Inverted image (F1 applied to all pixels)
            let R1 = 0, S1 = 0;
            let Rm1 = 0, Sm1 = 0;

            for (let g = 0; g < numGroups; g++) {
                const base = (g * 4) * stride + channelOffset;
                const x0 = F1(data[base]!);
                const x1 = F1(data[base + stride]!);
                const x2 = F1(data[base + stride * 2]!);
                const x3 = F1(data[base + stride * 3]!);

                const v = Math.abs(x0 - x1) + Math.abs(x1 - x2) + Math.abs(x2 - x3);

                const fx1 = F1(x1);
                const fx2 = F1(x2);
                const vM = Math.abs(x0 - fx1) + Math.abs(fx1 - fx2) + Math.abs(fx2 - x3);
                if (vM > v) R1++;
                else if (vM < v) S1++;

                const fmx1 = Fm1(x1);
                const fmx2 = Fm1(x2);
                const v_M = Math.abs(x0 - fmx1) + Math.abs(fmx1 - fmx2) + Math.abs(fmx2 - x3);
                if (v_M > v) Rm1++;
                else if (v_M < v) Sm1++;
            }

            const r = R / numGroups;
            const s = S / numGroups;
            const rm = Rm / numGroups;
            const sm = Sm / numGroups;

            const r1 = R1 / numGroups;
            const s1 = S1 / numGroups;
            const rm1 = Rm1 / numGroups;
            const sm1 = Sm1 / numGroups;

            const d0 = r - s;
            const dm0 = rm - sm;
            const d1 = r1 - s1;
            const dm1 = rm1 - sm1;

            const a = 2 * (d1 + d0);
            const b = dm0 - dm1 - d1 - (3 * d0);
            const c = d0 - dm0;

            let x = 0;
            const disc = b * b - 4 * a * c;

            if (Math.abs(a) < 1e-9) {
                x = Math.abs(b) > 1e-9 ? c / b : 0;
            } else if (disc >= 0) {
                const sqrtD = Math.sqrt(disc);
                const rootpos = (-b + sqrtD) / (2 * a);
                const rootneg = (-b - sqrtD) / (2 * a);
                x = Math.abs(rootpos) <= Math.abs(rootneg) ? rootpos : rootneg;
            } else {
                const denomR = r1 - r + rm - rm1;
                const denomS = s1 - s + sm - sm1;
                const cr = Math.abs(denomR) > 1e-9 ? (rm - r) / denomR : 0;
                const cs = Math.abs(denomS) > 1e-9 ? (sm - s) / denomS : 0;
                x = (cr + cs) / 2;
            }

            let p = 0;
            if (Math.abs(x - 0.5) > 1e-9) {
                p = x / (x - 0.5);
            }
            if (isNaN(p) || p < 0) p = 0;
            if (p > 1) p = 1;

            return { p, rM: r, sM: s, r_M: rm, s_M: sm, d0, dm0, d1, dm1 };
        }

        let result: { p: number; rM: number; sM: number; r_M: number; s_M: number; d0: number; dm0: number; d1: number; dm1: number };
        if (channel === 'r') {
            result = calculateChannel(0);
        } else if (channel === 'g') {
            result = calculateChannel(1);
        } else if (channel === 'b') {
            result = calculateChannel(2);
        } else {
            const rRes = calculateChannel(0);
            const gRes = calculateChannel(1);
            const bRes = calculateChannel(2);
            result = {
                p: (rRes.p + gRes.p + bRes.p) / 3,
                rM: (rRes.rM + gRes.rM + bRes.rM) / 3,
                sM: (rRes.sM + gRes.sM + bRes.sM) / 3,
                r_M: (rRes.r_M + gRes.r_M + bRes.r_M) / 3,
                s_M: (rRes.s_M + gRes.s_M + bRes.s_M) / 3,
                d0: (rRes.d0 + gRes.d0 + bRes.d0) / 3,
                dm0: (rRes.dm0 + gRes.dm0 + bRes.dm0) / 3,
                d1: (rRes.d1 + gRes.d1 + bRes.d1) / 3,
                dm1: (rRes.dm1 + gRes.dm1 + bRes.dm1) / 3
            };
        }

        const estimatedRatio = Math.round(result.p * 1000) / 1000;
        const estimatedPayloadPercent = Math.round(result.p * 1000) / 10;
        const diffR = Math.round(Math.abs(result.rM - result.r_M) * 1000) / 1000;
        const diffS = Math.round(Math.abs(result.sM - result.s_M) * 1000) / 1000;

        let verdict = "Temiz / Düşük Tespit Riski";
        let verdictLevel: 'clean' | 'suspicious' | 'stego' = 'clean';
        let details = `RS analizi R ve S grupları arasında doğal simetri olduğunu gösteriyor (Tahmini LSB Replacement: %${estimatedPayloadPercent}).`;

        if (estimatedPayloadPercent >= 25) {
            verdict = "⚠️ Yüksek Olasılıkla LSB Replacement İçeriyor";
            verdictLevel = 'stego';
            details = `RS analizi piksel gruplarında belirgin asimetri saptadı. Tahmini gömme oranı: %${estimatedPayloadPercent} (Not: LSB Matching bu testi atlatabilir).`;
        } else if (estimatedPayloadPercent >= 8) {
            verdict = "🔍 Şüpheli LSB Modifikasyonu";
            verdictLevel = 'suspicious';
            details = `Piksel gruplarında hafif asimetri gözlemlendi (%${estimatedPayloadPercent}). Düşük oranlı gömme veya yapay sıkıştırma olabilir.`;
        }

        return {
            Rm: Math.round(result.rM * 1000) / 1000,
            R_m: Math.round(result.r_M * 1000) / 1000,
            Sm: Math.round(result.sM * 1000) / 1000,
            S_m: Math.round(result.s_M * 1000) / 1000,
            diffR,
            diffS,
            estimatedRatio,
            estimatedPayloadPercent,
            verdict,
            verdictLevel,
            channel,
            details
        };
    },

    /**
     * Belirtilen renk kanalının belirli bir bit düzlemini (0..7) render eder.
     */
    renderBitPlane(imageData: SimpleImageData, channel: 'r' | 'g' | 'b' | 'a' | 'all', bitDepth: number): SimpleImageData {
        const { width, height, data } = imageData;
        const out = new Uint8ClampedArray(width * height * 4);
        const mask = 1 << bitDepth;

        for (let i = 0; i < data.length; i += 4) {
            let val = 0;
            if (channel === 'r') val = (data[i]! & mask) ? 255 : 0;
            else if (channel === 'g') val = (data[i + 1]! & mask) ? 255 : 0;
            else if (channel === 'b') val = (data[i + 2]! & mask) ? 255 : 0;
            else if (channel === 'a') val = (data[i + 3]! & mask) ? 255 : 0;
            else {
                const rBit = (data[i]! & mask) ? 1 : 0;
                const gBit = (data[i + 1]! & mask) ? 1 : 0;
                const bBit = (data[i + 2]! & mask) ? 1 : 0;
                val = (rBit || gBit || bBit) ? 255 : 0;
            }

            out[i] = val;
            out[i + 1] = val;
            out[i + 2] = val;
            out[i + 3] = 255;
        }

        return { width, height, data: out };
    },

    /**
     * Bölgesel χ² ısı haritası üretir.
     */
    renderHeatmap(imageData: SimpleImageData, blockSize: number = 32): SimpleImageData {
        const { width, height, data } = imageData;
        const out = new Uint8ClampedArray(width * height * 4);

        for (let by = 0; by < height; by += blockSize) {
            for (let bx = 0; bx < width; bx += blockSize) {
                const bw = Math.min(blockSize, width - bx);
                const bh = Math.min(blockSize, height - by);

                const hist = new Uint32Array(256);
                for (let y = by; y < by + bh; y++) {
                    for (let x = bx; x < bx + bw; x++) {
                        const idx = (y * width + x) * 4;
                        hist[data[idx]!]!++;
                        hist[data[idx + 1]!]!++;
                        hist[data[idx + 2]!]!++;
                    }
                }

                let chi = 0, k = 0;
                for (let i = 0; i < 256; i += 2) {
                    const sum = hist[i]! + hist[i + 1]!;
                    if (sum > 4) {
                        const exp = sum / 2;
                        chi += ((hist[i]! - exp) ** 2) / exp + ((hist[i + 1]! - exp) ** 2) / exp;
                        k++;
                    }
                }

                const dof = Math.max(1, k - 1);
                const z = (chi - dof) / Math.sqrt(2 * dof);
                const prob = 1 / (1 + Math.exp(-z));

                const r = Math.round(prob * 255);
                const g = Math.round((1 - prob) * 200);
                const b = 40;

                for (let y = by; y < by + bh; y++) {
                    for (let x = bx; x < bx + bw; x++) {
                        const idx = (y * width + x) * 4;
                        out[idx] = r;
                        out[idx + 1] = g;
                        out[idx + 2] = b;
                        out[idx + 3] = 220;
                    }
                }
            }
        }

        return { width, height, data: out };
    }
};
