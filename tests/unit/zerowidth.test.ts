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
});
