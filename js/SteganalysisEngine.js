/**
 * SteganalysisEngine.js (Faz 4: LSB Röntgeni & Chi-Square Steganaliz Motoru)
 * - LSB Bit Düzlemi (Bit-Plane 0 & 1) Görselleştirici
 * - Westfeld-Pfitzmann Pairs of Values (PoVs) Chi-Square (χ²) Steganaliz Testi
 * - Wilson-Hilferty normalleştirilmiş istatistiksel olasılık hesabı
 */

function normalCDF(z) {
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
     * ImageData'dan seçilen kanal ve bit derinliğine göre LSB Röntgen görüntüsü üretir.
     * @param {ImageData} sourceImageData
     * @param {'all'|'red'|'green'|'blue'} [channel='all']
     * @param {number} [bitDepth=1] - 1 (1-LSB) veya 2 (2-LSB)
     * @returns {ImageData}
     */
    renderBitPlane(sourceImageData, channel = 'all', bitDepth = 1) {
        const src = sourceImageData.data;
        const out = (typeof ImageData !== 'undefined')
            ? new ImageData(sourceImageData.width, sourceImageData.height)
            : { width: sourceImageData.width, height: sourceImageData.height, data: new Uint8ClampedArray(sourceImageData.width * sourceImageData.height * 4) };
        const dst = out.data;
        const mask = (1 << bitDepth) - 1;

        for (let i = 0; i < src.length; i += 4) {
            if (channel === 'all') {
                dst[i] = (src[i] & mask) ? 255 : 0;         // R
                dst[i + 1] = (src[i + 1] & mask) ? 255 : 0; // G
                dst[i + 2] = (src[i + 2] & mask) ? 255 : 0; // B
                dst[i + 3] = 255;                           // Alpha
            } else {
                let val;
                if (channel === 'red') val = src[i];
                else if (channel === 'green') val = src[i + 1];
                else val = src[i + 2];

                const bit = (val & mask) ? 255 : 0;
                dst[i] = bit;
                dst[i + 1] = bit;
                dst[i + 2] = bit;
                dst[i + 3] = 255;
            }
        }
        return out;
    },

    /**
     * Chi-Square (χ²) Pairs of Values (PoVs) testi ile LSB manipülasyon olasılığını hesaplar.
     * @param {ImageData} sourceImageData
     * @returns {{ probability: number, chiSquare: number, dof: number, verdict: string, details: string }}
     */
    analyzeChiSquare(sourceImageData) {
        const src = sourceImageData.data;
        const freq = new Uint32Array(256);

        // RGB kanallarının frekans histogramı (Alpha atlanır)
        for (let i = 0; i < src.length; i += 4) {
            freq[src[i]]++;
            freq[src[i + 1]]++;
            freq[src[i + 2]]++;
        }

        let chiSquare = 0;
        let k = 0; // dof (serbestlik derecesi)

        for (let pair = 0; pair < 128; pair++) {
            const f0 = freq[2 * pair];
            const f1 = freq[2 * pair + 1];
            const total = f0 + f1;

            // Beklenen frekans >= 5 şartı (asemptotik Ki-Kare şartı, total >= 10)
            if (total >= 10) {
                const expected = total / 2;
                chiSquare += Math.pow(f0 - expected, 2) / expected;
                chiSquare += Math.pow(f1 - expected, 2) / expected;
                k++;
            }
        }

        const dof = k - 1;
        if (dof <= 0) {
            return {
                probability: 0,
                chiSquare: 0,
                dof: 0,
                verdict: "Yetersiz Veri",
                details: "Görsel istatistiksel analiz için uygun değil veya varyasyon çok düşük."
            };
        }

        // Wilson-Hilferty normal dönüşümü (dof = k - 1 serbestlik derecesi)
        // Stego görsellerde (eşitlenmiş PoVs) z ~ N(0, 1) civarındadır.
        // Doğal görsellerde çiftler arasındaki doğal asimetri yüzünden z >> 5 çıkar.
        const safeChiSquare = Math.max(0, chiSquare);
        const z = (Math.pow(safeChiSquare / dof, 1 / 3) - (1 - 2 / (9 * dof))) / Math.sqrt(2 / (9 * dof));
        const cdf = normalCDF(z);
        const pValue = Math.max(0, Math.min(1, 1 - cdf)); // Westfeld sağ-kuyruk p-değeri

        // Stego güven skoru: z <= 2.5 (stego dağılımı içi) için yüksek olasılık, z > 5 için %0
        const probability = Math.max(0, Math.min(100, 100 / (1 + Math.exp((z - 2.5) * 1.5))));

        let verdict = "Temiz / Doğal Görsel";
        let details = "LSB piksel çiftlerinde doğal varyasyon tespit edildi. Görselde LSB Replacement yöntemi izi saptanmadı (Not: Bu test LSB Replacement tespitine yöneliktir).";

        if (probability >= 70) {
            verdict = "⚠️ Yüksek Olasılıkla LSB Şifreli Veri İçeriyor";
            details = "LSB değer çiftleri (PoVs) belirgin şekilde eşitlenmiş. Görselde belirgin LSB Replacement manipülasyonu tespit edildi.";
        } else if (probability >= 30) {
            verdict = "🔍 Şüpheli LSB Örüntüsü";
            details = "Piksel çiftlerinde kısmi homojenleşme var. Kısmi LSB gömme veya yapay sıkıştırma yapılmış olabilir.";
        }

        return {
            probability: parseFloat(probability.toFixed(1)),
            chiSquare: parseFloat(safeChiSquare.toFixed(2)),
            dof,
            pValue: parseFloat(pValue.toFixed(4)),
            verdict,
            details
        };
    },

    /**
     * Fridrich RS (Regular/Singular) Steganaliz Testi
     * LSB Replacement kaynaklı R/S simetri bozulmasını ölçerek tahmini gömme oranını (p) hesaplar.
     * @param {ImageData} sourceImageData
     * @param {'all'|'red'|'green'|'blue'} [channel='all']
     * @returns {{ estimatedP: number, rM: number, sM: number, r_M: number, s_M: number, d0: number, dm0: number, d1: number, dm1: number, verdict: string, details: string }}
     */
    analyzeRS(sourceImageData, channel = 'all') {
        const src = sourceImageData.data;
        const totalPixels = sourceImageData.width * sourceImageData.height;

        function F1(x) { return x ^ 1; }
        function Fm1(x) { return (x & 1) ? x + 1 : x - 1; }

        function calculateChannel(channelOffset, stride = 4) {
            const numGroups = Math.floor(totalPixels / 4);
            if (numGroups < 16) {
                return { p: 0, rM: 0, sM: 0, r_M: 0, s_M: 0, d0: 0, dm0: 0, d1: 0, dm1: 0 };
            }

            let R = 0, S = 0;
            let Rm = 0, Sm = 0;

            for (let g = 0; g < numGroups; g++) {
                const base = (g * 4) * stride + channelOffset;
                const x0 = src[base];
                const x1 = src[base + stride];
                const x2 = src[base + stride * 2];
                const x3 = src[base + stride * 3];

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
                const x0 = F1(src[base]);
                const x1 = F1(src[base + stride]);
                const x2 = F1(src[base + stride * 2]);
                const x3 = F1(src[base + stride * 3]);

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

        let result;
        if (channel === 'red') {
            result = calculateChannel(0);
        } else if (channel === 'green') {
            result = calculateChannel(1);
        } else if (channel === 'blue') {
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

        const estimatedP = parseFloat((result.p * 100).toFixed(1));
        let verdict = "Temiz / Düşük Tespit Riski";
        let details = `RS analizi R ve S grupları arasında doğal simetri olduğunu gösteriyor (Tahmini LSB Replacement: %${estimatedP}).`;

        if (estimatedP >= 25) {
            verdict = "⚠️ Yüksek Olasılıkla LSB Replacement İçeriyor";
            details = `RS analizi piksel gruplarında belirgin asimetri saptadı. Tahmini gömme oranı: %${estimatedP} (Not: LSB Matching bu testi atlatabilir).`;
        } else if (estimatedP >= 8) {
            verdict = "🔍 Şüpheli LSB Modifikasyonu";
            details = `Piksel gruplarında hafif asimetri gözlemlendi (%${estimatedP}). Düşük oranlı gömme veya yapay sıkıştırma olabilir.`;
        }

        return {
            estimatedP,
            estimatedPayloadPercent: estimatedP,
            rM: parseFloat(result.rM.toFixed(4)),
            sM: parseFloat(result.sM.toFixed(4)),
            r_M: parseFloat(result.r_M.toFixed(4)),
            s_M: parseFloat(result.s_M.toFixed(4)),
            d0: parseFloat(result.d0.toFixed(4)),
            dm0: parseFloat(result.dm0.toFixed(4)),
            d1: parseFloat(result.d1.toFixed(4)),
            dm1: parseFloat(result.dm1.toFixed(4)),
            stats: {
                RM: parseFloat(result.rM.toFixed(4)),
                SM: parseFloat(result.sM.toFixed(4)),
                R_M: parseFloat(result.r_M.toFixed(4)),
                S_M: parseFloat(result.s_M.toFixed(4)),
                d0: parseFloat(result.d0.toFixed(4)),
                d_minus0: parseFloat(result.dm0.toFixed(4))
            },
            verdict,
            details
        };
    },

    /**
     * Kayan Pencere χ² Bölgesel Isı Haritası (Local Sliding Window Heatmap)
     * Görseli bloklara bölerek bölgesel LSB homojenliğini görselleştirir.
     * @param {ImageData} sourceImageData
     * @param {number} [blockSize=32]
     * @returns {ImageData}
     */
    renderHeatmap(sourceImageData, blockSize = 32) {
        const width = sourceImageData.width;
        const height = sourceImageData.height;
        const src = sourceImageData.data;

        const out = (typeof ImageData !== 'undefined')
            ? new ImageData(width, height)
            : { width, height, data: new Uint8ClampedArray(width * height * 4) };
        const dst = out.data;

        // Her blok için yerel analiz
        for (let by = 0; by < height; by += blockSize) {
            for (let bx = 0; bx < width; bx += blockSize) {
                const bw = Math.min(blockSize, width - bx);
                const bh = Math.min(blockSize, height - by);

                const freq = new Uint32Array(256);
                let count = 0;

                for (let y = 0; y < bh; y++) {
                    const rowOffset = (by + y) * width * 4;
                    for (let x = 0; x < bw; x++) {
                        const idx = rowOffset + (bx + x) * 4;
                        freq[src[idx]]++;
                        freq[src[idx + 1]]++;
                        freq[src[idx + 2]]++;
                        count += 3;
                    }
                }

                // Blok içi PoVs Ki-Kare analizi
                let blockChi = 0;
                let k = 0;
                for (let pair = 0; pair < 128; pair++) {
                    const f0 = freq[2 * pair];
                    const f1 = freq[2 * pair + 1];
                    const tot = f0 + f1;
                    if (tot >= 4) {
                        const exp = tot / 2;
                        blockChi += Math.pow(f0 - exp, 2) / exp + Math.pow(f1 - exp, 2) / exp;
                        k++;
                    }
                }

                const dof = Math.max(1, k - 1);
                const z = (Math.pow(Math.max(0, blockChi) / dof, 1 / 3) - (1 - 2 / (9 * dof))) / Math.sqrt(2 / (9 * dof));
                const prob = Math.max(0, Math.min(100, 100 / (1 + Math.exp((z - 2.5) * 1.5))));

                // Renk seçimi: Yeşil (temiz), Sarı (şüpheli), Kırmızı (stego)
                let rVal = 46, gVal = 125, bVal = 50, aVal = 30; // Yeşil
                if (prob >= 65) {
                    rVal = 220; gVal = 38; bVal = 38; aVal = 130; // Kırmızı
                } else if (prob >= 25) {
                    rVal = 217; gVal = 119; bVal = 6; aVal = 80;  // Sarı/Turuncu
                }

                // Bloğu boya
                for (let y = 0; y < bh; y++) {
                    const rowOffset = (by + y) * width * 4;
                    for (let x = 0; x < bw; x++) {
                        const outIdx = rowOffset + (bx + x) * 4;
                        dst[outIdx] = rVal;
                        dst[outIdx + 1] = gVal;
                        dst[outIdx + 2] = bVal;
                        dst[outIdx + 3] = aVal;
                    }
                }
            }
        }

        return out;
    }
};
