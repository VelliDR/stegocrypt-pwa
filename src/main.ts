/**
 * src/main.ts
 * StegoCrypt TypeScript v3.1.0 - Main Application Controller.
 * Modüler UI orkestrasyonu, deterministik Canvas bütünlük denetimi ve PWA yaşam döngüsü.
 */

import { ImageEngine } from './codec/ImageEngine.ts';
import { clearStatus, getEl, setupPasswordToggles } from './ui/dom.ts';
import { initHideTab } from './ui/HideTab.ts';
import { initRevealTab } from './ui/RevealTab.ts';
import { initInspectTab } from './ui/InspectTab.ts';

// -----------------------------------------------------------------------------
// Ana Sekme ve Alt-Sekme Yönetimi
// -----------------------------------------------------------------------------
const btnTabHide = getEl<HTMLButtonElement>('btn-tab-hide');
const btnTabReveal = getEl<HTMLButtonElement>('btn-tab-reveal');
const btnTabInspect = getEl<HTMLButtonElement>('btn-tab-inspect');
const tabHide = getEl<HTMLElement>('tab-hide');
const tabReveal = getEl<HTMLElement>('tab-reveal');
const tabInspect = getEl<HTMLElement>('tab-inspect');

function activateTab(tab: 'hide' | 'reveal' | 'inspect'): void {
    clearStatus();
    btnTabHide.classList.toggle('active', tab === 'hide');
    btnTabReveal.classList.toggle('active', tab === 'reveal');
    btnTabInspect.classList.toggle('active', tab === 'inspect');

    btnTabHide.setAttribute('aria-selected', String(tab === 'hide'));
    btnTabReveal.setAttribute('aria-selected', String(tab === 'reveal'));
    btnTabInspect.setAttribute('aria-selected', String(tab === 'inspect'));

    tabHide.classList.toggle('active', tab === 'hide');
    tabReveal.classList.toggle('active', tab === 'reveal');
    tabInspect.classList.toggle('active', tab === 'inspect');
}

btnTabHide.addEventListener('click', () => activateTab('hide'));
btnTabReveal.addEventListener('click', () => activateTab('reveal'));
btnTabInspect.addEventListener('click', () => activateTab('inspect'));

const subtabBtns = [
    getEl<HTMLButtonElement>('btn-subtab-lsb'),
    getEl<HTMLButtonElement>('btn-subtab-binary'),
    getEl<HTMLButtonElement>('btn-subtab-diff'),
    getEl<HTMLButtonElement>('btn-subtab-zerowidth'),
    getEl<HTMLButtonElement>('btn-subtab-zsteg')
];
const subtabContents = [
    getEl<HTMLElement>('subtab-content-lsb'),
    getEl<HTMLElement>('subtab-content-binary'),
    getEl<HTMLElement>('subtab-content-diff'),
    getEl<HTMLElement>('subtab-content-zerowidth'),
    getEl<HTMLElement>('subtab-content-zsteg')
];

subtabBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
        subtabBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        subtabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        subtabContents[idx]?.classList.add('active');
    });
});

// -----------------------------------------------------------------------------
// Sekme Kontrolcülerini ve Parola Araçlarını Başlat
// -----------------------------------------------------------------------------
setupPasswordToggles();
initHideTab();
initRevealTab();
initInspectTab();

// -----------------------------------------------------------------------------
// Canvas Farbling / Parmak İzi Gürültüsü Denetimi (Deterministik + Rastgele)
// -----------------------------------------------------------------------------
const integrity = ImageEngine.verifyCanvasIntegrity();
if (!integrity.ok && integrity.farblingDetected) {
    getEl('banner-canvas-warning').style.display = 'flex';
}

// -----------------------------------------------------------------------------
// Service Worker Kaydı & Kullanıcı Onaylı Güncelleme (Yalnızca Üretim Derlemesi)
// -----------------------------------------------------------------------------
function setupServiceWorker(): void {
    if (!import.meta.env.PROD) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        let refreshing = false;
        const initialController = navigator.serviceWorker.controller;
        const bannerPwaUpdate = document.getElementById('banner-pwa-update');
        const btnPwaReload = document.getElementById('btn-pwa-reload');

        function showPwaUpdatePrompt(waitingWorker: ServiceWorker): void {
            if (!bannerPwaUpdate) return;
            bannerPwaUpdate.style.display = 'flex';
            if (btnPwaReload) {
                btnPwaReload.onclick = () => {
                    waitingWorker.postMessage({ action: 'SKIP_WAITING' });
                };
            }
        }

        navigator.serviceWorker.register('./sw.js').then((reg) => {
            if (reg.waiting) {
                showPwaUpdatePrompt(reg.waiting);
            }

            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showPwaUpdatePrompt(newWorker);
                    }
                });
            });
        }).catch((err) => {
            console.error('ServiceWorker kayıt hatası: ', err);
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing && initialController) {
                refreshing = true;
                window.location.reload();
            }
        });
    });
}

setupServiceWorker();

console.log("🌿 StegoCrypt TypeScript v3.1.0 initialized successfully.");
