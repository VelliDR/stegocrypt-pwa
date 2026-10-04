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
        const out = new ImageData(sourceImageData.width, sourceImageData.height);
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

            if (total > 8) {
                const expected = total / 2;
                chiSquare += Math.pow(f0 - expected, 2) / expected;
                chiSquare += Math.pow(f1 - expected, 2) / expected;
                k++;
            }
        }

        if (k <= 0) {
            return {
                probability: 0,
                chiSquare: 0,
                dof: 0,
                verdict: "Yetersiz Veri",
                details: "Görsel istatistiksel analiz için uygun değil."
            };
        }

        // Wilson-Hilferty normal dönüşümü
        const z = (Math.pow(chiSquare / k, 1 / 3) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
        const pValue = normalCDF(z);
        const probability = Math.max(0, Math.min(100, (1 - pValue) * 100));

        let verdict = "Temiz / Doğal Görsel";
        let details = "LSB piksel çiftlerinde doğal varyasyon tespit edildi. Görselde sıralı LSB manipülasyonu bulunmuyor veya PRNG homojen dağıtımla gizlenmiş.";

        if (probability >= 75) {
            verdict = "⚠️ Yüksek Olasılıkla LSB Şifreli Veri İçeriyor";
            details = "LSB değer çiftleri (PoVs) belirgin şekilde eşitlenmiş. Görselde açık LSB steganografi manipülasyonu tespit edildi.";
        } else if (probability >= 40) {
            verdict = "🔍 Şüpheli LSB Örüntüsü";
            details = "Piksel çiftlerinde kısmi homojenleşme var. Kısmi LSB gömme veya yapay sıkıştırma yapılmış olabilir.";
        }

        return {
            probability: parseFloat(probability.toFixed(1)),
            chiSquare: parseFloat(chiSquare.toFixed(2)),
            dof: k,
            verdict,
            details
        };
    }
};
