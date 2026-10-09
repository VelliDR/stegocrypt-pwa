import test from 'node:test';
import assert from 'node:assert/strict';
import { ZeroWidthDetector } from '../../js/ZeroWidthDetector.js';

test('ZeroWidthDetector - Clean text returns clean report with no invisible characters', () => {
    const text = "Merhaba dünya! Bu tamamen temiz ve doğal bir Türkçe metindir.";
    const result = ZeroWidthDetector.analyze(text);

    assert.equal(result.totalInvisible, 0);
    assert.equal(result.hasZeroWidth, false);
    assert.equal(result.hasBidi, false);
    assert.equal(result.hasAsciiSmuggling, false);
    assert.equal(result.cleanedText, text);
    assert.equal(result.verdictLevel, 'clean');
});

test('ZeroWidthDetector - Detects zero-width characters (ZWSP, ZWNJ, ZWJ) and cleans text', () => {
    // "Gizli\u200B\u200C\u200DMetin"
    const text = "Gizli\u200B\u200C\u200DMetin";
    const result = ZeroWidthDetector.analyze(text);

    assert.equal(result.totalInvisible, 3);
    assert.equal(result.hasZeroWidth, true);
    assert.equal(result.counts.ZWSP, 1);
    assert.equal(result.counts.ZWNJ, 1);
    assert.equal(result.counts.ZWJ, 1);
    assert.equal(result.cleanedText, "GizliMetin");
    assert.match(result.annotatedHtml, /\[ZWSP\]/);
    assert.match(result.annotatedHtml, /\[ZWNJ\]/);
    assert.match(result.annotatedHtml, /\[ZWJ\]/);
    assert.equal(result.verdictLevel, 'alert');
});

test('ZeroWidthDetector - Detects and decodes Unicode Plane 14 ASCII Smuggling', () => {
    // Unicode Plane 14 tag characters (ASCII smuggling):
    // 'H' (0x48) -> 0xE0048, 'I' (0x49) -> 0xE0049, 'D' (0x44) -> 0xE0044, 'E' (0x45) -> 0xE0045
    const smuggledTagString = String.fromCodePoint(0xE0048, 0xE0049, 0xE0044, 0xE0045);
    const hostText = `Açık metin başlangıcı ${smuggledTagString} açık metin bitişi.`;

    const result = ZeroWidthDetector.analyze(hostText);

    assert.equal(result.hasAsciiSmuggling, true);
    assert.equal(result.totalInvisible, 4);
    assert.equal(result.smuggledAscii, "HIDE");
    assert.equal(result.cleanedText, "Açık metin başlangıcı  açık metin bitişi.");
    assert.match(result.verdict, /ASCII Smuggling/);
    assert.match(result.annotatedHtml, /\[TAG: H\]/);
    assert.equal(result.verdictLevel, 'alert');
});

test('ZeroWidthDetector - Detects BiDi Trojan / Right-to-Left Override', () => {
    // Trojan dosya adı senaryosu: "malware\u202Ecod.exe" -> ekranda "malwareexe.doc" görünür
    const text = "malware\u202Ecod.exe";
    const result = ZeroWidthDetector.analyze(text);

    assert.equal(result.hasBidi, true);
    assert.equal(result.counts.RLO, 1);
    assert.equal(result.cleanedText, "malwarecod.exe");
    assert.match(result.verdict, /BiDi Trojan/);
    assert.equal(result.verdictLevel, 'warning');
});
