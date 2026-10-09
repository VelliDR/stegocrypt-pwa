/**
 * js/ZeroWidthDetector.js
 * Faz 5: Görünmez Karakter, BiDi Trojan ve ASCII Smuggling Dedektörü (Stego-Workbench)
 * - Metinlerde gizlenmiş ZWSP, ZWNJ, ZWJ, ZWNBSP ve görünmez ayraçları tespit eder.
 * - BiDi yönlendirme tuzaklarını (U+202A..U+202E, U+2066..U+2069) raporlar.
 * - Unicode Düzlem 14 Tag Karakterleri üzerinden yapılan "ASCII Smuggling" (U+E0000..U+E007F) saldırılarını yakalar ve çözer.
 * - Görsel etiketli (annotated) HTML ve temizlenmiş metin üretir.
 */

import { ZeroWidthEngine } from './ZeroWidthEngine.js';

// Karakter tanımları ve açıklamaları
const INVISIBLE_DEFINITIONS = {
    0x200B: { code: 'ZWSP', name: 'Zero-Width Space (Sıfır Genişlikli Boşluk)', category: 'zero-width' },
    0x200C: { code: 'ZWNJ', name: 'Zero-Width Non-Joiner', category: 'zero-width' },
    0x200D: { code: 'ZWJ', name: 'Zero-Width Joiner', category: 'zero-width' },
    0x2060: { code: 'WJ', name: 'Word Joiner', category: 'zero-width' },
    0xFEFF: { code: 'ZWNBSP', name: 'Zero-Width No-Break Space (BOM)', category: 'zero-width' },
    0x180E: { code: 'MVS', name: 'Mongolian Vowel Separator', category: 'zero-width' },
    0x00AD: { code: 'SHY', name: 'Soft Hyphen (Gizli Tire)', category: 'zero-width' },
    0x2061: { code: 'FUNC_APP', name: 'Function Application', category: 'invisible-operator' },
    0x2062: { code: 'INVIS_MUL', name: 'Invisible Times', category: 'invisible-operator' },
    0x2063: { code: 'INVIS_SEP', name: 'Invisible Separator', category: 'invisible-operator' },
    0x2064: { code: 'INVIS_PLUS', name: 'Invisible Plus', category: 'invisible-operator' },
    // BiDi Kontrol Karakterleri
    0x202A: { code: 'LRE', name: 'Left-to-Right Embedding', category: 'bidi' },
    0x202B: { code: 'RLE', name: 'Right-to-Left Embedding', category: 'bidi' },
    0x202C: { code: 'PDF', name: 'Pop Directional Formatting', category: 'bidi' },
    0x202D: { code: 'LRO', name: 'Left-to-Right Override', category: 'bidi' },
    0x202E: { code: 'RLO', name: 'Right-to-Left Override (BiDi Trojan)', category: 'bidi' },
    0x2066: { code: 'LRI', name: 'Left-to-Right Isolate', category: 'bidi' },
    0x2067: { code: 'RLI', name: 'Right-to-Left Isolate', category: 'bidi' },
    0x2068: { code: 'FSI', name: 'First Strong Isolate', category: 'bidi' },
    0x2069: { code: 'PDI', name: 'Pop Directional Isolate', category: 'bidi' }
};

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export const ZeroWidthDetector = {
    /**
     * Verilen metindeki tüm görünmez karakterleri, BiDi tuzaklarını ve ASCII Smuggling tag'lerini inceler.
     * @param {string} text
     * @returns {object}
     */
    analyze(text) {
        if (!text || typeof text !== 'string') {
            return {
                totalInvisible: 0,
                counts: {},
                hasZeroWidth: false,
                hasBidi: false,
                hasAsciiSmuggling: false,
                smuggledAscii: null,
                extractedZeroWidthPayload: null,
                cleanedText: "",
                annotatedHtml: "",
                verdict: "Metin Temiz",
                verdictLevel: "clean",
                verdictDetails: "Metinde gizlenmiş veya görünmez karakter tespit edilmedi."
            };
        }

        const counts = {};
        let totalInvisible = 0;
        let hasZeroWidth = false;
        let hasBidi = false;
        let hasAsciiSmuggling = false;

        const smuggledChars = [];
        const cleanedChars = [];
        const annotatedTokens = [];

        // Karakterleri code point bazında döngüye al (Surrogate pair'leri doğru ayrıştırır)
        for (const ch of text) {
            const cp = ch.codePointAt(0);

            // 1. Unicode Plane 14 Tags (ASCII Smuggling: U+E0000 .. U+E007F)
            if (cp >= 0xE0000 && cp <= 0xE007F) {
                hasAsciiSmuggling = true;
                totalInvisible++;
                counts['TAG_ASCII'] = (counts['TAG_ASCII'] || 0) + 1;
                counts.plane14Tags = (counts.plane14Tags || 0) + 1;

                if (cp >= 0xE0020 && cp <= 0xE007E) {
                    const asciiChar = String.fromCharCode(cp - 0xE0000);
                    smuggledChars.push(asciiChar);
                    annotatedTokens.push(`<span class="tag-pill tag-smuggle" title="Unicode Tag: ASCII Smuggling">[TAG: ${escapeHtml(asciiChar)}]</span>`);
                } else if (cp === 0xE0001) {
                    annotatedTokens.push(`<span class="tag-pill tag-smuggle" title="Tag Language Identifier">[TAG_START]</span>`);
                } else if (cp === 0xE007F) {
                    annotatedTokens.push(`<span class="tag-pill tag-smuggle" title="Cancel Tag">[TAG_CANCEL]</span>`);
                } else {
                    annotatedTokens.push(`<span class="tag-pill tag-smuggle" title="Tag Control">[TAG_${cp.toString(16).toUpperCase()}]</span>`);
                }
                continue;
            }

            // 2. Bilinen Görünmez ve BiDi Karakterleri
            const def = INVISIBLE_DEFINITIONS[cp];
            if (def) {
                totalInvisible++;
                counts[def.code] = (counts[def.code] || 0) + 1;
                const lowerCode = def.code.toLowerCase();
                counts[lowerCode] = (counts[lowerCode] || 0) + 1;

                if (def.category === 'zero-width') hasZeroWidth = true;
                if (def.category === 'bidi') {
                    hasBidi = true;
                    counts.bidiTrojan = (counts.bidiTrojan || 0) + 1;
                }

                const cssClass = def.category === 'bidi' ? 'tag-pill tag-bidi' : 'tag-pill tag-zw';
                annotatedTokens.push(`<span class="${cssClass}" title="${escapeHtml(def.name)}">[${def.code}]</span>`);
                continue;
            }

            // 3. Normal Görünür Karakter
            cleanedChars.push(ch);
            annotatedTokens.push(escapeHtml(ch));
        }

        const cleanedText = cleanedChars.join('');
        const annotatedHtml = annotatedTokens.join('');
        const smuggledAscii = smuggledChars.length > 0 ? smuggledChars.join('') : null;

        // ZeroWidthEngine ile klasik steganografik veri çıkarma denemesi
        let extractedZeroWidthPayload = null;
        if (hasZeroWidth) {
            try {
                const bytes = ZeroWidthEngine.extract(text);
                if (bytes && bytes.length > 0) {
                    extractedZeroWidthPayload = {
                        length: bytes.length,
                        bytes,
                        hexPreview: Array.from(bytes.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ')
                    };
                }
            } catch {
                // StegoCrypt formatında ikili veri yoksa görmezden gel
            }
        }

        // Değerlendirme (Verdict)
        let verdict = "Metin Temiz";
        let verdictLevel = "clean";
        let verdictDetails = "Metinde gizlenmiş görünmez karakter tespit edilmedi.";

        if (hasAsciiSmuggling) {
            verdict = "⚠️ Unicode Tag / ASCII Smuggling Tespit Edildi!";
            verdictLevel = "alert";
            verdictDetails = `Metin içine Unicode Plane 14 Tag karakterleri ile ${smuggledChars.length} karakterlik ASCII metin kaçırılmış. Çözülen metin: "${smuggledAscii}". Bu teknik LLM yönlendirmeleri ve güvenlik filtrelerini atlatmak için kullanılır.`;
        } else if (hasBidi) {
            verdict = "⚠️ BiDi Trojan / Yönlendirme Kontrolü Saptandı!";
            verdictLevel = "warning";
            verdictDetails = "Metinde Right-to-Left Override (RLO) veya yönlendirme karakterleri bulundu. Dosya uzantılarını veya URL'leri ters göstererek kullanıcıyı yanıltma riski taşır.";
        } else if (hasZeroWidth) {
            verdict = "🔍 Sıfır Genişlikli (Zero-Width) Karakterler Bulundu";
            verdictLevel = "alert";
            verdictDetails = `Metin içerisinde ${totalInvisible} adet sıfır genişlikli karakter (ZWSP/ZWNJ/ZWJ) tespit edildi. Gizli veri aktarımı veya görünmez filigran (watermark) yapılmış olabilir.`;
        }

        return {
            totalInvisible,
            counts,
            hasZeroWidth,
            hasBidi,
            hasAsciiSmuggling,
            hasTags: hasAsciiSmuggling,
            smuggledAscii,
            smuggledText: smuggledAscii,
            extractedZeroWidthPayload,
            cleanedText,
            cleanText: cleanedText,
            annotatedHtml,
            highlightedHtml: annotatedHtml,
            verdict,
            verdictLevel,
            verdictDetails
        };
    }
};
