# Vendor Kütüphane Envanteri ve Güvenlik Politikası (VENDOR.md)

Bu belgede `stegocrypt-pwa` v3.1.0 üretim derlemesinde kullanılan tüm üçüncü taraf istemci bağımlılıkları, sürümleri, lisansları ve menşe kaynakları listelenmiştir.

---

## 1. Üretim Bağımlılıkları Envanteri

| Paket | Sürüm | Lisans | Kullanım Alanı | Menşe (Upstream) |
|---|---|---|---|---|
| **@noble/ciphers** | `^1.2.1` (1.3.0) | MIT | ChaCha20-Poly1305 (RFC 8439) AEAD şifreleme | [paulmillr/noble-ciphers](https://github.com/paulmillr/noble-ciphers) |
| **hash-wasm** | `^4.12.0` | MIT | Argon2id WebAssembly (SIMD, bellek-zorlu KDF) | [Daninet/hash-wasm](https://github.com/Daninet/hash-wasm) |
| **jsqr** | `^1.4.0` | Apache-2.0 | İstemci taraflı saf TypeScript/JS QR kod çözücü | [cozmo/jsQR](https://github.com/cozmo/jsQR) |
| **qrcode-generator** | `^2.0.4` | MIT | UTF-8 & Zero-Width uyumlu QR kod üreteci | [kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) |

> **Not:** Eski `v3.0.0-legacy-js` sürümündeki `js/vendor/*` (`heic2any`, statik `jsQR.js`, `qrcode.mjs`) dosyaları TypeScript/Vite v3.1.0 geçişiyle birlikte npm paket yönetimine taşınmıştır (`package-lock.json` bütünlük doğrulamasıyla).

---

## 2. Bütünlük Doğrulaması

Tüm bağımlılıkların `package-lock.json` içerisindeki kriptografik `integrity` (SHA-512) özetleri `npm ci` sırasında otomatik doğrulanır.

---

## 3. Güvenlik ve Bağımsızlık İlkesi

- Projede hiçbir CDN veya dış sunucu bağlantısı (`connect-src 'self'`, harici `script-src`) bulunmamaktadır.
- Tüm üçüncü taraf bağımlılıklar Vite tarafından yerel `dist/assets/` içine paketlenir, Service Worker ile çevrimdışı önbelleklenir ve `index.html` üzerinde Content Security Policy (`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'`) politikasıyla sınırlandırılmıştır.
- Paketlerde herhangi bir telemetri, analitik izleme veya harici ağ çağrısı bulunmamaktadır.
