/**
 * src/codec/CompressionEngine.ts
 * Yerel Tarayıcı Streams API tabanlı Deflate / Inflate sıkıştırma motoru.
 */

async function runCompressionStream(
    stream: CompressionStream | DecompressionStream,
    inputBytes: Uint8Array
): Promise<Uint8Array> {
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    const writePromise = (async () => {
        try {
            await writer.write(inputBytes as unknown as BufferSource);
            await writer.close();
        } catch {
            // Hatalar reader akışı üzerinden fırlatılır
        }
    })();

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

    await writePromise;

    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

export const CompressionEngine = {
    /**
     * Ham baytları Deflate ile sıkıştırır.
     */
    async compress(rawBytes: Uint8Array): Promise<Uint8Array> {
        if (rawBytes.length === 0) return new Uint8Array(0);
        return runCompressionStream(new CompressionStream('deflate'), rawBytes);
    },

    /**
     * Deflate ile sıkıştırılmış baytları orijinal haline açar.
     */
    async decompress(compressedBytes: Uint8Array): Promise<Uint8Array> {
        if (compressedBytes.length === 0) return new Uint8Array(0);
        return runCompressionStream(new DecompressionStream('deflate'), compressedBytes);
    }
};
