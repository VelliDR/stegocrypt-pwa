import { describe, it, expect } from 'vitest';
import { ZeroWidthEngine } from '../../src/stego/ZeroWidthEngine.ts';
import { ZeroWidthDetector } from '../../src/forensics/ZeroWidthDetector.ts';

describe('ZeroWidthEngine and Plane 14 Steganography', () => {
    it('encodes and extracts binary payload in zero-width characters', () => {
        const message = "TOP_SECRET_COORDINATES_39.9042_116.4074";
        const bytes = new TextEncoder().encode(message);

        const invisible = ZeroWidthEngine.encode(bytes);
        expect(invisible.length).toBeGreaterThan(0);

        // Embed invisible characters inside carrier text
        const carrier = `Normal looking sentence ${invisible} with secret payload hidden inside.`;

        const extractedBytes = ZeroWidthEngine.extractZeroWidth(carrier);
        const extractedMessage = new TextDecoder().decode(extractedBytes);

        expect(extractedMessage).toBe(message);
    });

    it('smuggles ASCII text into Unicode Plane 14 tags and decodes correctly', () => {
        const secret = "SYSTEM_OVERRIDE_ADMIN";
        const smuggled = ZeroWidthEngine.encodePlane14(secret);

        const decoded = ZeroWidthEngine.decodePlane14(smuggled);
        expect(decoded).toBe(secret);

        const detection = ZeroWidthDetector.analyze(`Host prompt: ${smuggled}`);
        expect(detection.hasZeroWidth).toBe(true);
        expect(detection.smuggledText).toBe(secret);
    });

    it('detects and catalogs Variation Selectors (VS1-VS16 and VS17-VS256)', () => {
        // VS16 (U+FE0F) and VS17 (U+E0100)
        const vs16 = '\uFE0F';
        const vs17 = String.fromCodePoint(0xE0100);
        const textWithVs = `Secret message with emojis 🛡️${vs16} and supplementary variation ${vs17}`;

        const report = ZeroWidthDetector.analyze(textWithVs);
        expect(report.hasZeroWidth).toBe(true);
        expect(report.hasVariationSelectors).toBe(true);
        expect(report.categories?.variationSelectors).toBeGreaterThanOrEqual(2);
        expect(report.types.some(t => t.includes('Variation Selector'))).toBe(true);
    });

    it('detects and flags BiDi Trojan attacks (RLO extension spoofing and modern isolates)', () => {
        // RLO (Right-to-Left Override) for file extension spoofing: malicious_exe.pdf
        const rloSpoofed = 'financial_report_\u202Efdp.exe';
        const isolateSpoofed = 'User query: \u2066reversed_text\u2069';

        const reportRlo = ZeroWidthDetector.analyze(rloSpoofed);
        expect(reportRlo.hasZeroWidth).toBe(true);
        expect(reportRlo.hasBidiTrojan).toBe(true);
        expect(reportRlo.categories?.bidiControls).toBe(1);

        const reportIsolate = ZeroWidthDetector.analyze(isolateSpoofed);
        expect(reportIsolate.hasZeroWidth).toBe(true);
        expect(reportIsolate.hasBidiTrojan).toBe(true);
        expect(reportIsolate.categories?.bidiControls).toBe(2);
    });

    it('detects invisible fillers (Hangul Filler, Halfwidth Hangul Filler, Mongolian Vowel Separator)', () => {
        const hangulFiller = '\u3164';
        const halfHangul = '\uFFA0';
        const mvs = '\u180E';
        const suspiciousBio = `LegitUsername${hangulFiller}${halfHangul}${mvs}`;

        const report = ZeroWidthDetector.analyze(suspiciousBio);
        expect(report.hasZeroWidth).toBe(true);
        expect(report.categories?.invisibleFillers).toBe(3);
        expect(report.types).toContain('Hangul Filler (U+3164)');
        expect(report.types).toContain('Halfwidth Hangul Filler (U+FFA0)');
        expect(report.types).toContain('Mongolian Vowel Separator (U+180E)');
    });

    it('detects invisible formatting, math operators, and word joiner', () => {
        const shy = '\u00AD';     // Soft Hyphen
        const cgj = '\u034F';     // Combining Grapheme Joiner
        const mathTimes = '\u2062'; // Invisible Times
        const wj = '\u2060';      // Word Joiner

        const input = `Alpha${shy}Beta${cgj}Gamma${mathTimes}Delta${wj}`;
        const report = ZeroWidthDetector.analyze(input);

        expect(report.hasZeroWidth).toBe(true);
        expect(report.categories?.invisibleMathOrFormat).toBe(3);
        expect(report.categories?.zeroWidth).toBe(1);
        expect(report.types).toContain('Soft Hyphen (U+00AD)');
        expect(report.types).toContain('Combining Grapheme Joiner (U+034F)');
        expect(report.types).toContain('Word Joiner (U+2060)');
    });

    it('detects whitespace steganography in multiline text', () => {
        // Trailing spaces and tabs at line endings
        const textWithTrailing = "First line with normal text.\nSecond line with trailing spaces   \nThird line.\t\t";
        const report = ZeroWidthDetector.analyze(textWithTrailing);

        expect(report.hasZeroWidth).toBe(true);
        expect(report.hasWhitespaceStego).toBe(true);
        expect(report.categories?.trailingWhitespace).toBe(5); // 3 spaces + 2 tabs
        expect(report.types.some(t => t.includes('Satır Sonu Boşluk Steganografisi'))).toBe(true);
    });

    it('cleanses all deceptive, invisible, and trojan characters cleanly', () => {
        const dirtyText = "Secret\u200B Message\u3164 with\u202E Trojan\uFE0F and tags" + String.fromCodePoint(0xE0021) + "   \nNext line.";
        const report = ZeroWidthDetector.analyze(dirtyText);

        expect(report.hasZeroWidth).toBe(true);
        expect(report.cleanedText).not.toContain('\u200B');
        expect(report.cleanedText).not.toContain('\u3164');
        expect(report.cleanedText).not.toContain('\u202E');
        expect(report.cleanedText).not.toContain('\uFE0F');
        expect(report.cleanedText).not.toContain(String.fromCodePoint(0xE0021));
        expect(report.cleanedText).toBe("Secret Message with Trojan and tags\nNext line.");
    });
});
