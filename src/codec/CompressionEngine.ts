/**
 * src/codec/CompressionEngine.ts
 * Yerel Tarayıcı Streams API tabanlı Deflate / Inflate sıkıştırma motoru.
 */

export const CompressionEngine = {
    /**
     * Ham baytları Deflate ile sıkıştırır.
     */
    async compress(rawBytes: Uint8Array): Promise<Uint8Array> {
        if (rawBytes.length === 0) return new Uint8Array(0);

        const cs = new CompressionStream('deflate');
        const writer = cs.writable.getWriter();
        writer.write(rawBytes as unknown as BufferSource);
        writer.close();

        const reader = cs.readable.getReader();
        const chunks: Uint8Array[] = [];
        let totalLen = 0;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                totalLen += value.length;
            }
        }

        const out = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    },

    /**
     * Deflate ile sıkıştırılmış baytları orijinal haline açar.
     */
    async decompress(compressedBytes: Uint8Array): Promise<Uint8Array> {
        if (compressedBytes.length === 0) return new Uint8Array(0);

        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        writer.write(compressedBytes as unknown as BufferSource);
        writer.close();

        const reader = ds.readable.getReader();
        const chunks: Uint8Array[] = [];
        let totalLen = 0;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
                chunks.push(value);
                totalLen += value.length;
            }
        }

        const out = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
            out.set(chunk, offset);
            offset += chunk.length;
        }
        return out;
    }
};
