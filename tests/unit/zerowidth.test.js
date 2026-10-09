import test from 'node:test';
import assert from 'node:assert/strict';
import { ZeroWidthEngine } from '../../js/ZeroWidthEngine.js';

test('ZeroWidthEngine - Encode and extract bytes roundtrip', () => {
    const originalBytes = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0xFF, 0x00, 0x55, 0xAA]);
    const encoded = ZeroWidthEngine.encode(originalBytes);

    // Each byte has 8 bits, each bit is one invisible character
    assert.strictEqual(encoded.length, originalBytes.length * 8);

    // Embed into cover text
    const coverText = 'Merhaba dünya! Bu normal bir metindir.';
    const combined = coverText.slice(0, 7) + encoded + coverText.slice(7);

    const extracted = ZeroWidthEngine.extractZeroWidth(combined);
    assert.deepStrictEqual(extracted, originalBytes);
});

test('ZeroWidthEngine - Throws error when no zero-width characters exist', () => {
    const plainText = 'Tamamen normal metin, hiç gizli karakter yok.';
    assert.throws(
        () => ZeroWidthEngine.extractZeroWidth(plainText),
        /bulunamadı/i
    );
});

test('ZeroWidthEngine - Throws error when bit count is not a multiple of 8', () => {
    // 7 bits
    const corruptText = '\u200B\u200C\u200B\u200C\u200B\u200C\u200B';
    assert.throws(
        () => ZeroWidthEngine.extractZeroWidth(corruptText),
        /bulunamadı/i
    );
});
