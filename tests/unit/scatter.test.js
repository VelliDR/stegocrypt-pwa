import test from 'node:test';
import assert from 'node:assert/strict';
import { ScatterEngine } from '../../js/ScatterEngine.js';

function gcd(a, b) {
    while (b) {
        let t = b;
        b = a % b;
        a = t;
    }
    return a;
}

test('ScatterEngine - Parameter derivation is deterministic and step is coprime', async () => {
    const totalChannels = 1200;
    const password = 'TestScatterPassword123';

    const p1 = await ScatterEngine.deriveParams(password, totalChannels, 'all');
    const p2 = await ScatterEngine.deriveParams(password, totalChannels, 'all');

    assert.strictEqual(p1.c0, p2.c0);
    assert.strictEqual(p1.step, p2.step);
    assert.strictEqual(p1.nPartition, totalChannels);
    assert.strictEqual(gcd(p1.step, p1.nPartition), 1, 'step must be coprime with nPartition');
});

test('ScatterEngine - Permutation is bijective (zero collisions across full partition)', async () => {
    const totalChannels = 500;
    const password = 'BijectiveTestSecret';
    const { c0, step, nPartition } = await ScatterEngine.deriveParams(password, totalChannels, 'all');

    const visitedRawIndices = new Set();
    for (let i = 0; i < nPartition; i++) {
        const rawIdx = ScatterEngine.getPartitionRawIndex(i, totalChannels, c0, step, 'all');
        // Alpha channel (rawIdx % 4 === 3) must never be touched
        assert.notStrictEqual(rawIdx % 4, 3, 'Permutation must never map to Alpha channel');
        assert.ok(!visitedRawIndices.has(rawIdx), `Collision detected at step ${i} for rawIdx ${rawIdx}`);
        visitedRawIndices.add(rawIdx);
    }

    assert.strictEqual(visitedRawIndices.size, nPartition, 'Every channel must be visited exactly once');
});

test('ScatterEngine - Even and Odd partitions are completely disjoint', async () => {
    const totalChannels = 600;
    const passEven = 'DecoyPassword';
    const passOdd = 'RealPassword';

    const pEven = await ScatterEngine.deriveParams(passEven, totalChannels, 'even');
    const pOdd = await ScatterEngine.deriveParams(passOdd, totalChannels, 'odd');

    const evenIndices = new Set();
    for (let i = 0; i < pEven.nPartition; i++) {
        const raw = ScatterEngine.getPartitionRawIndex(i, totalChannels, pEven.c0, pEven.step, 'even');
        evenIndices.add(raw);
    }

    const oddIndices = new Set();
    for (let i = 0; i < pOdd.nPartition; i++) {
        const raw = ScatterEngine.getPartitionRawIndex(i, totalChannels, pOdd.c0, pOdd.step, 'odd');
        oddIndices.add(raw);
    }

    // Check intersection
    for (const idx of evenIndices) {
        assert.ok(!oddIndices.has(idx), `Overlap detected between even and odd partition at rawIdx ${idx}`);
    }

    assert.strictEqual(evenIndices.size + oddIndices.size, totalChannels, 'Sum of partition sizes must equal totalChannels');
});
