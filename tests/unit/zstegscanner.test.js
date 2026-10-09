import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZstegScanner } from '../../js/ZstegScanner.js';
import '../helpers/mockImageData.js';

test('ZstegScanner - getCombinations returns 56 unique combinations', () => {
    const combos = ZstegScanner.getCombinations();
    assert.equal(combos.length, 56);

    const ids = new Set(combos.map(c => c.id));
    assert.equal(ids.size, 56);

    // Verify presence of standard zsteg combinations
    assert.ok(ids.has('rgb,1b,lsb,xy'));
    assert.ok(ids.has('bgr,1b,lsb,xy'));
    assert.ok(ids.has('r,1b,lsb,xy'));
    assert.ok(ids.has('g,1b,msb,yx'));
    assert.ok(ids.has('b,2b,lsb,xy'));
    assert.ok(ids.has('rgba,2b,msb,yx'));
});

test('ZstegScanner - extractBytes correctly reconstructs embedded byte sequence', () => {
    const width = 20;
    const height = 20;
    const data = new Uint8ClampedArray(width * height * 4);
    // Fill with background
    data.fill(128);

    // Embed byte sequence: [0x50, 0x4B, 0x03, 0x04] (ZIP magic) into rgb, 1b, lsb, xy
    const targetBytes = [0x50, 0x4B, 0x03, 0x04];
    const bits = [];
    for (const b of targetBytes) {
        for (let i = 0; i < 8; i++) {
            bits.push((b >> i) & 1);
        }
    }

    // Embed bits into RGB channels sequentially
    let bitIdx = 0;
    for (let y = 0; y < height && bitIdx < bits.length; y++) {
        for (let x = 0; x < width && bitIdx < bits.length; x++) {
            const pxOffset = (y * width + x) * 4;
            for (let c = 0; c < 3 && bitIdx < bits.length; c++) {
                const bit = bits[bitIdx++];
                data[pxOffset + c] = (data[pxOffset + c] & 0xFE) | bit;
            }
        }
    }

    const img = { width, height, data };
    const extracted = ZstegScanner.extractBytes(img, [0, 1, 2], 1, 'lsb', 'xy', 4);
    assert.deepEqual(Array.from(extracted), targetBytes);
});

test('ZstegScanner - inspectSample detects signatures, flags, and text', () => {
    // 1. ZIP Signature
    const zipBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const zipResult = ZstegScanner.inspectSample(zipBytes);
    assert.ok(zipResult);
    assert.equal(zipResult.type, 'signature');
    assert.equal(zipResult.ext, 'zip');

    // 2. CTF Flag Pattern
    const flagStr = 'flag{stego_master_ctf_winner_2026}';
    const flagBytes = new TextEncoder().encode(flagStr);
    const flagResult = ZstegScanner.inspectSample(flagBytes);
    assert.ok(flagResult);
    assert.equal(flagResult.type, 'flag');
    assert.equal(flagResult.preview, flagStr);

    // 3. Printable ASCII Text
    const textStr = 'This is a secret classified military dispatch note.';
    const textBytes = new TextEncoder().encode(textStr);
    const textResult = ZstegScanner.inspectSample(textBytes);
    assert.ok(textResult);
    assert.equal(textResult.type, 'text');
    assert.ok(textResult.preview.includes('secret classified'));

    // 4. Random binary noise returns null
    const noiseBytes = new Uint8Array([0x00, 0x12, 0x7E, 0x00, 0xA3, 0x51, 0x00, 0xC4]);
    const noiseResult = ZstegScanner.inspectSample(noiseBytes);
    assert.equal(noiseResult, null);
});

test('ZstegScanner - scan finds embedded CTF flag in blue channel', () => {
    const width = 30;
    const height = 30;
    const data = new Uint8ClampedArray(width * height * 4);
    data.fill(200);

    const secretFlag = 'flag{blue_channel_hidden_message}';
    const flagBytes = new TextEncoder().encode(secretFlag);
    const bits = [];
    for (const b of flagBytes) {
        for (let i = 0; i < 8; i++) {
            bits.push((b >> i) & 1);
        }
    }

    // Embed into Blue channel (offset 2), 1-bit, lsb, xy
    let bitIdx = 0;
    for (let y = 0; y < height && bitIdx < bits.length; y++) {
        for (let x = 0; x < width && bitIdx < bits.length; x++) {
            const pxOffset = (y * width + x) * 4;
            const bit = bits[bitIdx++];
            data[pxOffset + 2] = (data[pxOffset + 2] & 0xFE) | bit;
        }
    }

    const img = { width, height, data };
    const findings = ZstegScanner.scan(img, { maxSampleBytes: 512 });

    assert.ok(findings.length > 0);
    const blueFinding = findings.find(f => f.comboId === 'b,1b,lsb,xy');
    assert.ok(blueFinding, 'b,1b,lsb,xy combination should be detected');
    assert.equal(blueFinding.type, 'flag');
    assert.equal(blueFinding.preview, secretFlag);

    // Extract payload test
    const extractedAll = ZstegScanner.extractPayload(img, 'b,1b,lsb,xy', flagBytes.length);
    const extractedStr = new TextDecoder().decode(extractedAll);
    assert.equal(extractedStr, secretFlag);
});
