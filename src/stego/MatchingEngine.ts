/**
 * src/stego/MatchingEngine.ts
 * LSB Matching (±1 Embedding) Motoru.
 * - Çift/tek sayı asimetrisini (Pairs of Values) kırarak χ² ve temel RS testlerine karşı bağışıklık sağlar.
 * - 0 ve 255 piksel taşma sınırlarını (clamping) korur.
 */

/**
 * 1-bit LSB Matching (±1):
 * Eğer pikselin son biti hedef bite eşitse pikseli korur.
 * Değilse rastgele +1 veya -1 ekler. 0 ve 255 sınırları kontrol edilir.
 */
export function matchLsb1(val: number, targetBit: number, randChoice: boolean = Math.random() < 0.5): number {
    if ((val & 1) === targetBit) return val;
    if (val === 0) return 1;
    if (val === 255) return 254;
    return randChoice ? val + 1 : val - 1;
}

/**
 * 2-bit LSB Matching (|Δ| <= 2):
 * Hedef 2-bit değerine sahip ve mutlak farkı (|Δ|) en küçük olan değeri seçer.
 * Eşitlik durumunda (örn. delta = -2 ve +2) rastgele seçim yapar.
 */
export function matchLsb2(val: number, targetBits: number, randChoice: boolean = Math.random() < 0.5): number {
    const curr = val & 3;
    if (curr === targetBits) return val;

    let bestDiff = 999;
    let candidates: number[] = [];

    for (const delta of [-2, 2, -1, 1, -3, 3]) {
        const cand = val + delta;
        if (cand >= 0 && cand <= 255 && (cand & 3) === targetBits) {
            const absDiff = Math.abs(delta);
            if (absDiff < bestDiff) {
                bestDiff = absDiff;
                candidates = [cand];
            } else if (absDiff === bestDiff) {
                candidates.push(cand);
            }
        }
    }

    if (candidates.length === 1 && candidates[0] !== undefined) return candidates[0];
    if (candidates.length > 1 && candidates[0] !== undefined && candidates[1] !== undefined) {
        return randChoice ? candidates[0] : candidates[1];
    }

    return (val & ~3) | targetBits;
}
