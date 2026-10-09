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

    test('6. Steganalysis Tab - Natural vs Stego Detection, RS Analysis and Heatmap', async ({ page }) => {
        await page.goto('/');
        await page.locator('#btn-tab-inspect').click();

        // 1. Analyze natural carrier
        const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
        await page.locator('#file-inspect').setInputFiles(carrierPath);

        await expect(page.locator('#inspect-controls')).toBeVisible();
        await expect(page.locator('#inspect-verdict')).toContainText(/Temiz|Doğal/i);

        // 2. Fridrich RS Steganalysis card verification
        await expect(page.locator('#inspect-rs-report')).toBeVisible();
        await expect(page.locator('#inspect-rs-badge')).toBeVisible();
        await expect(page.locator('#inspect-rs-verdict')).toContainText(/Temiz|Düşük/i);

        // 3. Bit-plane canvas should be rendered
        const canvas = page.locator('#canvas-inspect');
        await expect(canvas).toBeVisible();

        // 4. View Mode toggle: Heatmap vs Bit Plane
        const labelEl = page.locator('#inspect-canvas-label');
        await expect(labelEl).toContainText(/Bit Düzlemi/i);

        await page.locator('#view-mode-heatmap').click();
        await expect(labelEl).toContainText(/Isı Haritası/i);

        await page.locator('#view-mode-bitplane').click();
        await expect(labelEl).toContainText(/Bit Düzlemi/i);
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

    test('8. Phase 2 Web Worker & Format v3 PngCodec Bit-Exact Pipeline Verification', async ({ page }) => {
        await page.goto('/');

        // Verify Web Worker API is supported and active in browser
        const hasWorker = await page.evaluate(() => typeof window.Worker !== 'undefined');
        expect(hasWorker).toBe(true);

        const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
        await page.locator('#file-hide').setInputFiles(carrierPath);

        const secretText = 'Faz 2 Web Worker 600k KDF & PngCodec Doğrulama Testi!';
        const password = 'Phase2WorkerPassword#2026';

        await page.locator('#text-hide').fill(secretText);
        await page.locator('#pass-hide').fill(password);

        // Click Hide
        await page.locator('#btn-encrypt').click();

        const btnShare = page.locator('#btn-share');
        await expect(btnShare).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await btnShare.click();
        const download = await downloadPromise;
        const downloadPath = await download.path();

        // Verify PNG magic header and binary structure
        const fileBytes = fs.readFileSync(downloadPath);
        const pngMagic = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        for (let i = 0; i < 8; i++) {
            expect(fileBytes[i]).toBe(pngMagic[i]);
        }

        // Reveal tab roundtrip
        await page.locator('#btn-tab-reveal').click();
        await page.locator('#file-reveal').setInputFiles(downloadPath);
        await page.locator('#pass-reveal').fill(password);
        await page.locator('#btn-decrypt').click();

        const outputArea = page.locator('#text-reveal');
        await expect(outputArea).toBeVisible();
        await expect(outputArea).toHaveValue(secretText);
    });

    test('9. Phase 3 - LSB Matching (±1) Toggle, Roundtrip & RS Immunity Verification', async ({ page }) => {
        await page.goto('/');

        const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
        await page.locator('#file-hide').setInputFiles(carrierPath);

        // Verify LSB Matching is selected by default
        const matchingRadio = page.locator('#method-matching');
        await expect(matchingRadio).toBeChecked();

        const secretText = 'Faz 3 LSB Matching (±1) ve Fridrich RS Doğrulama Testi!';
        const password = 'Phase3MatchingPassword#2026';

        await page.locator('#text-hide').fill(secretText);
        await page.locator('#pass-hide').fill(password);

        // Click Hide
        await page.locator('#btn-encrypt').click();

        const btnShare = page.locator('#btn-share');
        await expect(btnShare).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await btnShare.click();
        const download = await downloadPromise;
        const downloadPath = await download.path();

        // 1. Inspect tab: verify RS Steganalysis on LSB Matching stego image
        await page.locator('#btn-tab-inspect').click();
        await page.locator('#file-inspect').setInputFiles(downloadPath);

        await expect(page.locator('#inspect-controls')).toBeVisible();
        await expect(page.locator('#inspect-rs-report')).toBeVisible();
        // LSB matching maintains symmetry, so RS verdict should avoid high replacement detection
        await expect(page.locator('#inspect-rs-verdict')).toContainText(/Temiz|Düşük|Şüpheli/i);

        // 2. Reveal tab: verify exact roundtrip decodability
        await page.locator('#btn-tab-reveal').click();
        await page.locator('#file-reveal').setInputFiles(downloadPath);
        await page.locator('#pass-reveal').fill(password);
        await page.locator('#btn-decrypt').click();

        const outputArea = page.locator('#text-reveal');
        await expect(outputArea).toBeVisible();
        await expect(outputArea).toHaveValue(secretText);
    });

    test('10. Phase 4 - Content-Adaptive Lattice Embedding & Stego Risk Index Dynamic Feedback', async ({ page }) => {
        await page.goto('/');

        const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
        await page.locator('#file-hide').setInputFiles(carrierPath);

        // Verify Adaptive scatter mode radio is checked by default
        const adaptiveRadio = page.locator('#scatter-mode-adaptive');
        await expect(adaptiveRadio).toBeChecked();

        // Risk indicator should be hidden initially before entering text
        const riskIndicator = page.locator('#container-risk-indicator');
        await expect(riskIndicator).toBeHidden();

        // Type secret message
        const secretText = 'Faz 4 İçerik Duyarlı Doku Kafesi ve Stego Risk İndeksi Doğrulama Testi #2026';
        const password = 'AdaptiveLatticePassword!2026';
        await page.locator('#text-hide').fill(secretText);
        await page.locator('#pass-hide').fill(password);

        // Stego Risk indicator should become visible dynamically
        await expect(riskIndicator).toBeVisible();
        const riskBadge = page.locator('#risk-badge');
        await expect(riskBadge).toContainText(/%/);

        // Encrypt using Adaptive lattice + LSB matching
        await page.locator('#btn-encrypt').click();

        // Status banner should confirm Adaptive format v3 completion
        const statusBox = page.locator('#status-msg');
        await expect(statusBox).toContainText(/İçerik Duyarlı Doku/i);

        const btnShare = page.locator('#btn-share');
        await expect(btnShare).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await btnShare.click();
        const download = await downloadPromise;
        const downloadPath = await download.path();

        // Decrypt in Reveal tab via extractAuto transparent resolution
        await page.locator('#btn-tab-reveal').click();
        await page.locator('#file-reveal').setInputFiles(downloadPath);
        await page.locator('#pass-reveal').fill(password);
        await page.locator('#btn-decrypt').click();

        const outputArea = page.locator('#text-reveal');
        await expect(outputArea).toBeVisible();
        await expect(outputArea).toHaveValue(secretText);
    });

    test('11. Phase 5 - Binary Inspector & Trailing Overlay (ZIP Injection) Detection', async ({ page }) => {
        await page.goto('/');

        // Create a PNG fixture with trailing ZIP overlay injected
        const cleanPng = fs.readFileSync(path.join(fixturesDir, 'opaque_carrier.png'));
        const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
        const fakeZipPayload = Buffer.concat([zipHeader, Buffer.from("SECRET_FORENSIC_ZIP_PAYLOAD_TEST")]);
        const injectedPng = Buffer.concat([cleanPng, fakeZipPayload]);
        const tmpInjectedPath = path.join(fixturesDir, 'temp_injected_overlay.png');
        fs.writeFileSync(tmpInjectedPath, injectedPng);

        try {
            // Switch to Inspect Tab and Binary Subtab
            await page.locator('#btn-tab-inspect').click();
            await page.locator('#btn-subtab-binary').click();

            // Upload the injected PNG
            await page.locator('#file-binary').setInputFiles(tmpInjectedPath);

            // Verify Results Card is displayed
            await expect(page.locator('#container-binary-results')).toBeVisible();
            await expect(page.locator('#binary-format-badge')).toHaveText('PNG');

            // Verify Overlay Alert is displayed and detects ZIP signature
            await expect(page.locator('#binary-overlay-card')).toBeVisible();
            await expect(page.locator('#binary-overlay-details')).toContainText(/ZIP Arşivi/i);
            await expect(page.locator('#binary-overlay-hex')).toContainText(/50 4B 03 04/i);

            // Verify Chunks Table has parsed chunks (IHDR, IDAT, IEND)
            const rows = page.locator('#tbody-binary-chunks tr');
            await expect(rows.first()).toBeVisible();
            await expect(page.locator('#tbody-binary-chunks')).toContainText('IHDR');
            await expect(page.locator('#tbody-binary-chunks')).toContainText('IEND');

            // Verify trailing payload download button works
            const downloadPromise = page.waitForEvent('download');
            await page.locator('#btn-download-overlay').click();
            const download = await downloadPromise;
            const downloadedPath = await download.path();
            const downloadedBytes = fs.readFileSync(downloadedPath);
            expect(downloadedBytes.length).toBe(fakeZipPayload.length);
            expect(downloadedBytes[0]).toBe(0x50);
            expect(downloadedBytes[1]).toBe(0x4B);
        } finally {
            if (fs.existsSync(tmpInjectedPath)) fs.unlinkSync(tmpInjectedPath);
        }
    });

    test('12. Phase 5 - Diff Engine & Visual Fidelity Metrics (PSNR / SSIM / LSB Map)', async ({ page }) => {
        await page.goto('/');

        // 1. Embed a message to produce a valid stego image
        const carrierPath = path.join(fixturesDir, 'opaque_carrier.png');
        await page.locator('#file-hide').setInputFiles(carrierPath);

        const secretText = 'Diff Engine Sadakat ve Kalite Testi #2026';
        const password = 'DiffTestPassword!2026';
        await page.locator('#text-hide').fill(secretText);
        await page.locator('#pass-hide').fill(password);

        await page.locator('#btn-encrypt').click();
        const btnShare = page.locator('#btn-share');
        await expect(btnShare).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await btnShare.click();
        const download = await downloadPromise;
        const stegoDownloadPath = await download.path();

        // 2. Switch to Inspect Tab and Diff Subtab
        await page.locator('#btn-tab-inspect').click();
        await page.locator('#btn-subtab-diff').click();

        // Upload Cover and Stego images
        await page.locator('#file-diff-cover').setInputFiles(carrierPath);
        await page.locator('#file-diff-stego').setInputFiles(stegoDownloadPath);

        // Wait for asynchronous image decoding to complete in browser
        await expect(page.locator('#label-diff-cover')).toContainText(/Cover \(\d+x\d+\)/);
        await expect(page.locator('#label-diff-stego')).toContainText(/Stego \(\d+x\d+\)/);

        // Click Run Diff button
        await page.locator('#btn-run-diff').click();

        // Verify Results Container and Quantitative Badges
        await expect(page.locator('#container-diff-results')).toBeVisible();

        const psnrText = await page.locator('#diff-psnr-val').innerText();
        expect(psnrText).toMatch(/dB/i);

        const ssimText = await page.locator('#diff-ssim-val').innerText();
        const ssimVal = parseFloat(ssimText);
        expect(ssimVal).toBeGreaterThan(0.95); // High structural fidelity

        // Verify Canvas is rendered
        const canvas = page.locator('#canvas-diff');
        await expect(canvas).toBeVisible();

        // Toggle LSB mode
        await page.locator('#diff-mode-lsb').check();
        await expect(page.locator('#container-diff-slider')).toBeHidden();
        await expect(canvas).toBeVisible();
    });

    test('13. Phase 5 - Zero-Width & Unicode Plane 14 ASCII Smuggling Detector', async ({ page }) => {
        await page.goto('/');

        // Switch to Inspect Tab and Zero-Width Subtab
        await page.locator('#btn-tab-inspect').click();
        await page.locator('#btn-subtab-zerowidth').click();

        // Text with:
        // 1. Visible cover text: "Prompt: Summarize this text."
        // 2. ZWSP characters: \u200B\u200C
        // 3. BiDi Trojan RLO: \u202E
        // 4. Unicode Plane 14 Tags encoding "SECRET":
        //    'S': \u{E0053}, 'E': \u{E0045}, 'C': \u{E0043}, 'R': \u{E0052}, 'E': \u{E0045}, 'T': \u{E0054}
        const smuggledTags = '\u{E0053}\u{E0045}\u{E0043}\u{E0052}\u{E0045}\u{E0054}';
        const suspiciousText = `Prompt: Summarize this text.\u200B\u200C\u202E${smuggledTags}`;

        await page.locator('#text-zerowidth-input').fill(suspiciousText);
        await page.locator('#btn-analyze-zerowidth').click();

        // Verify Results Container
        await expect(page.locator('#container-zerowidth-results')).toBeVisible();

        // Verify Verdict Banner
        await expect(page.locator('#zerowidth-verdict-banner')).toContainText(/Gizli Karakter Tespit Edildi/i);

        // Verify ASCII Smuggling Decoded Payload
        await expect(page.locator('#container-smuggled-ascii')).toBeVisible();
        await expect(page.locator('#text-smuggled-payload')).toHaveValue('SECRET');

        // Verify BiDi Warning
        await expect(page.locator('#container-bidi-warning')).toBeVisible();

        // Verify Cleaned Text output
        await expect(page.locator('#text-zerowidth-clean')).toHaveValue('Prompt: Summarize this text.');
    });
});


