/**
 * src/forensics/ZeroWidthDetector.ts
 * Görünmez Karakter, BiDi Truva Atı ve Unicode Düzlem 14 ASCII Smuggling Dedektörü.
 */

import { ZeroWidthEngine } from '../stego/ZeroWidthEngine.ts';
import type { ZeroWidthReport } from '../types/index.ts';

export const ZeroWidthDetector = {
    analyze(text: string): ZeroWidthReport {
        let count = 0;
        const typesSet = new Set<string>();
        let hasBidiTrojan = false;

        for (const char of text) {
            const code = char.codePointAt(0);
            if (!code) continue;

            if (code === 0x200B) { count++; typesSet.add('ZWSP (U+200B)'); }
            else if (code === 0x200C) { count++; typesSet.add('ZWNJ (U+200C)'); }
            else if (code === 0x200D) { count++; typesSet.add('ZWJ (U+200D)'); }
            else if (code === 0xFEFF) { count++; typesSet.add('BOM / ZWNBSP (U+FEFF)'); }
            else if (code === 0x202E || code === 0x202D || code === 0x202B || code === 0x202A) {
                count++;
                typesSet.add('BiDi Control (RLO/LRO)');
                hasBidiTrojan = true;
            } else if (code >= 0xE0020 && code <= 0xE007E) {
                count++;
                typesSet.add('Unicode Düzlem 14 Tag');
            }
        }

        const smuggledText = ZeroWidthEngine.decodePlane14(text);
        const cleanedText = text
            .replace(/[\u200B\u200C\u200D\uFEFF\u202A-\u202E]/g, '')
            .replace(/[\u{E0000}-\u{E007F}]/gu, '');

        return {
            hasZeroWidth: count > 0,
            count,
            types: Array.from(typesSet),
            cleanedText,
            smuggledText: smuggledText || undefined,
            hasBidiTrojan
        };
    }
};
