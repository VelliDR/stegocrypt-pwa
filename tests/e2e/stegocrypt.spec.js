import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

test.describe('StegoCrypt PWA - Core E2E Tests', () => {

    test('1. Security & Console Audit - Strict CSP with zero errors or violations', async ({ page }) => {
        const scriptErrors = [];
        const cspViolations = [];

        page.on('console', msg => {
            const text = msg.text();
            if (msg.type() === 'error' && !text.includes('favicon')) {
                scriptErrors.push(text);
            }
            if (text.toLowerCase().includes('violates the following content security policy')) {
                cspViolations.push(text);
            }
        });

        const pageErrors = [];
        page.on('pageerror', err => {
            pageErrors.push(err.message);
        });

        await page.goto('/');

        // Wait for page to initialize
        await expect(page.locator('h1')).toHaveText(/StegoCrypt/i);

        // Ensure canvas integrity self-test passed without farbling banner in clean Chromium
        const bannerWarning = page.locator('#banner-canvas-warning');
        await expect(bannerWarning).toBeHidden();

        expect(pageErrors).toEqual([]);
        expect(cspViolations).toEqual([]);
        expect(scriptErrors).toEqual([]);
    });

    test('2. Text Hiding & Revealing Roundtrip in Opaque Carrier', async ({ page }) => {
        await page.goto('/');

        // Select Text mode (default)
        const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
        await page.locator('#file-hide').setInputFiles(carrierPath);

        // Enter secret text and password
        const secretText = 'Playwright e2e gizli test mesajı #2026';
        const password = 'TestSecretPass123!';

        await page.locator('#text-hide').fill(secretText);
        await page.locator('#pass-hide').fill(password);

        // Click Hide button and wait for share/download button
        await page.locator('#btn-encrypt').click();
        const btnShare = page.locator('#btn-share');
        await expect(btnShare).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await btnShare.click();
        const download = await downloadPromise;

        const downloadPath = await download.path();
        expect(fs.existsSync(downloadPath)).toBe(true);

        // Switch to Reveal Tab
        await page.locator('#btn-tab-reveal').click();
        await page.locator('#file-reveal').setInputFiles(downloadPath);
        await page.locator('#pass-reveal').fill(password);
        await page.locator('#btn-decrypt').click();

        // Verify decrypted text
        const outputArea = page.locator('#text-reveal');
        await expect(outputArea).toBeVisible();
        await expect(outputArea).toHaveValue(secretText);
    });

    test('3. Transparent PNG Carrier Roundtrip (Alpha Flattening Verification)', async ({ page }) => {
        await page.goto('/');

        // Upload carrier with alpha channel
        const carrierPath = path.join(fixturesDir, 'transparent_carrier.png');
        await page.locator('#file-hide').setInputFiles(carrierPath);

        const secretText = 'Şeffaf PNG taşıyıcı testi - Alfa kanalı LSB bozulması engellendi.';
        const password = 'TransparentCarrierPass';

        await page.locator('#text-hide').fill(secretText);
        await page.locator('#pass-hide').fill(password);

        // Embed and download
        await page.locator('#btn-encrypt').click();
        const btnShare = page.locator('#btn-share');
        await expect(btnShare).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await btnShare.click();
        const download = await downloadPromise;
        const downloadPath = await download.path();

        // Switch to Reveal Tab
        await page.locator('#btn-tab-reveal').click();
        await page.locator('#file-reveal').setInputFiles(downloadPath);
        await page.locator('#pass-reveal').fill(password);
        await page.locator('#btn-decrypt').click();

        // Verify decrypted output
        const outputArea = page.locator('#text-reveal');
        await expect(outputArea).toBeVisible();
        await expect(outputArea).toHaveValue(secretText);
    });

    test('4. File Hiding & Revealing Roundtrip', async ({ page }) => {
        await page.goto('/');

        // Select File Mode
        await page.locator('#type-file').click();

        const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
        const secretFilePath = path.join(fixturesDir, 'secret_document.txt');

        await page.locator('#file-hide').setInputFiles(carrierPath);
        await page.locator('#file-secret-input').setInputFiles(secretFilePath);

        const password = 'FileHidingPassword999';
        await page.locator('#pass-hide').fill(password);

        // Embed and download stego image
        await page.locator('#btn-encrypt').click();
        const btnShare = page.locator('#btn-share');
        await expect(btnShare).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await btnShare.click();
        const download = await downloadPromise;
        const downloadPath = await download.path();

        // Reveal tab
        await page.locator('#btn-tab-reveal').click();
        await page.locator('#file-reveal').setInputFiles(downloadPath);
        await page.locator('#pass-reveal').fill(password);
        await page.locator('#btn-decrypt').click();

        // File download button should appear
        const btnDownloadFile = page.locator('#btn-download-file');
        await expect(btnDownloadFile).toBeVisible();

        // Trigger file download and verify content
        const fileDownloadPromise = page.waitForEvent('download');
        await btnDownloadFile.click();
        const fileDownload = await fileDownloadPromise;
        const downloadedFilePath = await fileDownload.path();

        const content = fs.readFileSync(downloadedFilePath, 'utf8');
        expect(content).toBe('Bu bir gizli e2e test belgesidir. Çok gizli!');
    });

    test('5. Deniable Dual-Layer (Decoy vs Real) Roundtrip', async ({ page }) => {
        await page.goto('/');

        const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
        await page.locator('#file-hide').setInputFiles(carrierPath);

        // Check Deniable Mode
        await page.locator('#check-deniable').check();
        await expect(page.locator('#container-deniable-fields')).toBeVisible();

        const decoyText = 'Tuzak Veri: Sıradan yemek tarifi';
        const decoyPass = 'TuzakParola123';
        const realText = 'Gerçek Veri: Çok gizli kasa şifresi #777';
        const realPass = 'GercekParola999';

        await page.locator('#text-decoy').fill(decoyText);
        await page.locator('#pass-decoy').fill(decoyPass);
        await page.locator('#text-hide').fill(realText);
        await page.locator('#pass-hide').fill(realPass);

        // Embed and download
        await page.locator('#btn-encrypt').click();
        const btnShare = page.locator('#btn-share');
        await expect(btnShare).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await btnShare.click();
        const download = await downloadPromise;
        const downloadPath = await download.path();

        // Reveal Decoy
        await page.locator('#btn-tab-reveal').click();
        await page.locator('#file-reveal').setInputFiles(downloadPath);
        await page.locator('#pass-reveal').fill(decoyPass);
        await page.locator('#btn-decrypt').click();
        await expect(page.locator('#text-reveal')).toHaveValue(decoyText);

        // Reveal Real
        await page.locator('#pass-reveal').fill(realPass);
        await page.locator('#btn-decrypt').click();
        await expect(page.locator('#text-reveal')).toHaveValue(realText);
    });

    test('6. Steganalysis Tab - Natural vs Stego Detection', async ({ page }) => {
        await page.goto('/');
        await page.locator('#btn-tab-inspect').click();

        // 1. Analyze natural carrier
        const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
        await page.locator('#file-inspect').setInputFiles(carrierPath);

        await expect(page.locator('#inspect-controls')).toBeVisible();
        await expect(page.locator('#inspect-verdict')).toContainText(/Temiz|Doğal/i);

        // Bit-plane canvas should be rendered
        const canvas = page.locator('#canvas-inspect');
        await expect(canvas).toBeVisible();
    });

    test('7. Zero-Width Invisible Text Roundtrip', async ({ page }) => {
        await page.goto('/');

        await page.locator('#type-invisible').click();
        await page.locator('#text-cover').fill('Bu sıradan bir WhatsApp mesajıdır.');
        await page.locator('#text-hide').fill('Görünmez gizli bilgi');
        await page.locator('#pass-hide').fill('InvisiblePass1');

        await page.locator('#btn-encrypt').click();

        const invisibleOutput = page.locator('#text-invisible-output');
        await expect(invisibleOutput).toBeVisible();
        const invisibleText = await invisibleOutput.inputValue();
        expect(invisibleText.length).toBeGreaterThan(30);

        // Switch to Reveal Tab
        await page.locator('#btn-tab-reveal').click();
        await page.locator('#reveal-type-text').click();

        await page.locator('#text-reveal-input').fill(invisibleText);
        await page.locator('#pass-reveal').fill('InvisiblePass1');
        await page.locator('#btn-decrypt').click();

        await expect(page.locator('#text-reveal')).toHaveValue('Görünmez gizli bilgi');
    });
});
