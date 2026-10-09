import { test, expect } from '@playwright/test';

test.describe('HEIC & Strict CSP Evaluation', () => {
    test('Verify heic2any loading and eval behavior under strict CSP', async ({ page }) => {
        const cspViolations = [];
        page.on('console', msg => {
            if (msg.text().toLowerCase().includes('violates the following content security policy')) {
                cspViolations.push(msg.text());
            }
        });

        await page.goto('/');

        // Attempt to load heic2any in the page context
        const result = await page.evaluate(async () => {
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = './js/vendor/heic2any.min.js';
                    script.onload = resolve;
                    script.onerror = () => reject(new Error("Failed to load heic2any script"));
                    document.head.appendChild(script);
                });

                return {
                    loaded: true,
                    isFunction: typeof window.heic2any === 'function'
                };
            } catch (err) {
                return { loaded: false, error: err.message };
            }
        });

        expect(result.loaded).toBe(true);
        expect(result.isFunction).toBe(true);

        console.log('heic2any test result in browser:', result);
        console.log('CSP violations recorded:', cspViolations);
    });
});
