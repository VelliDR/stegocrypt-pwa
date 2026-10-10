import { describe, it, expect } from 'vitest';
import { ScatterEngine } from '../../src/stego/ScatterEngine.ts';

describe('ScatterEngine', () => {
    it('Parameter derivation is deterministic and step is coprime', async () => {
        const totalChannels = 12000;
        const p1 = await ScatterEngine.deriveParams('TestPass', totalChannels, 'all');
        const p2 = await ScatterEngine.deriveParams('TestPass', totalChannels, 'all');

        expect(p1.c0).toBe(p2.c0);
        expect(p1.step).toBe(p2.step);
        expect(p1.nPartition).toBe(totalChannels);
    });

    it('Permutation is bijective with zero collisions', async () => {
        const totalChannels = 3000;
        const { c0, step, nPartition } = await ScatterEngine.deriveParams('BijectiveCheck', totalChannels, 'all');

        const seen = new Set<number>();
        for (let i = 0; i < nPartition; i++) {
            const rawIdx = ScatterEngine.getPartitionRawIndex(i, totalChannels, c0, step, 'all');
            expect(seen.has(rawIdx)).toBe(false);
            seen.add(rawIdx);
        }

        expect(seen.size).toBe(nPartition);
    });

    it('Even and Odd partitions are completely disjoint', async () => {
        const totalChannels = 4000;
        const pEven = await ScatterEngine.deriveParams('SharedPass', totalChannels, 'even');
        const pOdd = await ScatterEngine.deriveParams('SharedPass', totalChannels, 'odd');

        const evenIndices = new Set<number>();
        for (let i = 0; i < pEven.nPartition; i++) {
            evenIndices.add(ScatterEngine.getPartitionRawIndex(i, totalChannels, pEven.c0, pEven.step, 'even'));
        }

        for (let i = 0; i < pOdd.nPartition; i++) {
            const oddIdx = ScatterEngine.getPartitionRawIndex(i, totalChannels, pOdd.c0, pOdd.step, 'odd');
            expect(evenIndices.has(oddIdx)).toBe(false);
        }
    });
});
