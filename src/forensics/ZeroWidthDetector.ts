/**
 * src/forensics/ZeroWidthDetector.ts
 * Kapsamlı Görünmez Karakter, Variation Selector, BiDi Truva Atı,
 * Görünmez Dolgu/Biçim/Matematik Karakterleri, Satır Sonu Boşluk Steganografisi
 * ve Unicode Düzlem 14 ASCII Smuggling Adli Triyaj Dedektörü.
 */

import { ZeroWidthEngine } from '../stego/ZeroWidthEngine.ts';
import type { ZeroWidthReport } from '../types/index.ts';

export const ZeroWidthDetector = {
    analyze(text: string): ZeroWidthReport {
        let count = 0;
        const typesSet = new Set<string>();
        let hasBidiTrojan = false;
        let hasVariationSelectors = false;
        let hasWhitespaceStego = false;

        const categories = {
            zeroWidth: 0,
            variationSelectors: 0,
            invisibleFillers: 0,
            invisibleMathOrFormat: 0,
            bidiControls: 0,
            tagPlane14: 0,
            trailingWhitespace: 0
        };

        for (const char of text) {
            const code = char.codePointAt(0);
            if (!code) continue;

            // 1. Sıfır Genişlikli (Zero-Width) Karakterler
            if (code === 0x200B) {
                count++;
                categories.zeroWidth++;
                typesSet.add('ZWSP (U+200B)');
            } else if (code === 0x200C) {
                count++;
                categories.zeroWidth++;
                typesSet.add('ZWNJ (U+200C)');
            } else if (code === 0x200D) {
                count++;
                categories.zeroWidth++;
                typesSet.add('ZWJ (U+200D)');
            } else if (code === 0x2060) {
                count++;
                categories.zeroWidth++;
                typesSet.add('Word Joiner (U+2060)');
            } else if (code === 0xFEFF) {
                count++;
                categories.zeroWidth++;
                typesSet.add('BOM / ZWNBSP (U+FEFF)');
            }
            // 2. Variation Selectors (VS1–VS16 ve VS17–VS256)
            else if (code >= 0xFE00 && code <= 0xFE0F) {
                count++;
                categories.variationSelectors++;
                hasVariationSelectors = true;
                typesSet.add(`Variation Selector (U+${code.toString(16).toUpperCase()}, VS${code - 0xFE00 + 1})`);
            } else if (code >= 0xE0100 && code <= 0xE01EF) {
                count++;
                categories.variationSelectors++;
                hasVariationSelectors = true;
                typesSet.add(`Supplementary Variation Selector (U+${code.toString(16).toUpperCase()}, VS${code - 0xE0100 + 17})`);
            }
            // 3. Görünmez Dolgular ve Ayraçlar (Fillers)
            else if (code === 0x3164) {
                count++;
                categories.invisibleFillers++;
                typesSet.add('Hangul Filler (U+3164)');
            } else if (code === 0xFFA0) {
                count++;
                categories.invisibleFillers++;
                typesSet.add('Halfwidth Hangul Filler (U+FFA0)');
            } else if (code === 0x180E) {
                count++;
                categories.invisibleFillers++;
                typesSet.add('Mongolian Vowel Separator (U+180E)');
            }
            // 4. Görünmez Biçimlendirme & Matematik İşleçleri
            else if (code === 0x00AD) {
                count++;
                categories.invisibleMathOrFormat++;
                typesSet.add('Soft Hyphen (U+00AD)');
            } else if (code === 0x034F) {
                count++;
                categories.invisibleMathOrFormat++;
                typesSet.add('Combining Grapheme Joiner (U+034F)');
            } else if (code >= 0x2061 && code <= 0x2064) {
                count++;
                categories.invisibleMathOrFormat++;
                const mathNames: Record<number, string> = {
                    0x2061: 'Function Application (U+2061)',
                    0x2062: 'Invisible Times (U+2062)',
                    0x2063: 'Invisible Separator (U+2063)',
                    0x2064: 'Invisible Plus (U+2064)'
                };
                typesSet.add(`Görünmez Matematik: ${mathNames[code] ?? code.toString(16)}`);
            }
            // 5. BiDi Kontrolleri & Truva Atı Karakterleri
            else if (code >= 0x202A && code <= 0x202E) {
                count++;
                categories.bidiControls++;
                hasBidiTrojan = true;
                const bidiNames: Record<number, string> = {
                    0x202A: 'LRE (U+202A)',
                    0x202B: 'RLE (U+202B)',
                    0x202C: 'PDF (U+202C)',
                    0x202D: 'LRO (U+202D)',
                    0x202E: 'RLO (U+202E)'
                };
                typesSet.add(`BiDi Override/Embedding (${bidiNames[code]})`);
            } else if (code >= 0x2066 && code <= 0x2069) {
                count++;
                categories.bidiControls++;
                hasBidiTrojan = true;
                const isolateNames: Record<number, string> = {
                    0x2066: 'LRI (U+2066)',
                    0x2067: 'RLI (U+2067)',
                    0x2068: 'FSI (U+2068)',
                    0x2069: 'PDI (U+2069)'
                };
                typesSet.add(`BiDi Isolate (${isolateNames[code]})`);
            } else if (code === 0x200E || code === 0x200F || code === 0x061C) {
                count++;
                categories.bidiControls++;
                typesSet.add(`BiDi Yön İmi (U+${code.toString(16).toUpperCase()})`);
            }
            // 6. Unicode Düzlem 14 (Tag Plane / ASCII Smuggling)
            else if (code >= 0xE0020 && code <= 0xE007E) {
                count++;
                categories.tagPlane14++;
                typesSet.add('Unicode Düzlem 14 Tag');
            }
        }

        // 7. Satır Sonu Whitespace (SNOW / Boşluk Steganografisi) Analizi
        const trailingMatches = text.match(/[ \t]{2,}(?=\r?\n|$)/g);
        if (trailingMatches && trailingMatches.length > 0) {
            let totalTrailingWs = 0;
            for (const m of trailingMatches) {
                totalTrailingWs += m.length;
            }
            if (totalTrailingWs >= 2) {
                hasWhitespaceStego = true;
                categories.trailingWhitespace = totalTrailingWs;
                typesSet.add(`Satır Sonu Boşluk Steganografisi (${totalTrailingWs} karakter)`);
                count += totalTrailingWs;
            }
        }

        const smuggledText = ZeroWidthEngine.decodePlane14(text);

        // Kapsamlı temizleme: Tüm gizli/görünmez kod noktalarını ve satır sonu boşluklarını temizler
        const cleanedText = text
            .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
            .replace(/[\u00AD\u034F\u180E\u3164\uFFA0]/g, '')
            .replace(/[\u2061-\u2064]/g, '')
            .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g, '')
            .replace(/[\uFE00-\uFE0F]/g, '')
            .replace(/[\u{E0000}-\u{E007F}]/gu, '')
            .replace(/[\u{E0100}-\u{E01EF}]/gu, '')
            .replace(/[ \t]+$/gm, '');

        return {
            hasZeroWidth: count > 0,
            count,
            types: Array.from(typesSet),
            cleanedText,
            smuggledText: smuggledText || undefined,
            hasBidiTrojan,
            hasVariationSelectors,
            hasWhitespaceStego,
            categories
        };
    }
};
