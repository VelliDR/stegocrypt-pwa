# 🌿 StegoCrypt

### İstemci Taraflı İstatistiksel Dirençli Steganografi, Kriptografi & Adli Bilişim Çalışma İstasyonu

[![CI](https://github.com/VelliDR/stegocrypt-pwa/actions/workflows/deploy.yml/badge.svg)](https://github.com/VelliDR/stegocrypt-pwa/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript: 5.7](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vite: 6.x](https://img.shields.io/badge/Vite-6.x-646CFF.svg)](https://vitejs.dev/)

🌐 **Canlı Demo (PWA):** [https://vellidr.github.io/stegocrypt-pwa/](https://vellidr.github.io/stegocrypt-pwa/)

---

> [!CAUTION]
> **Sorumluluk Reddi (Disclaimer):**  
> Bu yazılım eğitim, araştırma ve güvenlik farkındalığı amacıyla geliştirilmiştir. **Bağımsız bir kriptografik güvenlik denetiminden (third-party security audit) geçmemiştir; operasyonel güvenlik (OPSEC), muhbirlik veya hayati risk taşıyan senaryolar için uygun değildir.**

---

## 📌 Genel Bakış

**StegoCrypt**, modern web standartları (Web Crypto API, Streams API, Web Workers, WebAssembly) üzerinde çalışan, **%100 istemci tarafında** ve sıfır sunucu bağımlılığıyla işleyen bir steganografi ve adli analiz (forensics workbench) uygulamasıdır.

> **Kod Tabanı Notu:** Bu depo, projenin birincil ve aktif sürümü olan **v3.1.0 (Vite + TypeScript)** mimarisini barındırır. Eski vanilla JavaScript sürümü `v3.0.0-legacy-js` etiketinde dondurulmuştur.

---

## 🛡️ Temel Yetenekler & Mühendislik Mimarisi

### 1. Kriptografi ve Anahtar Yönetimi
* **AES-256-GCM (AEAD):** Gizlilik ve kimlik doğrulama/bütünlük koruması.
* **Bellek-Zorlu KDF:** GPU/ASIC kaba kuvvet saldırılarına karşı **Argon2id (64 MB RAM Wasm)** veya OWASP önerisiyle **600.000 iterasyonlu PBKDF2-HMAC-SHA256**.
* **HKDF-Expand:** Çoklu katman anahtarları ve afin permütasyon tohumları tek anahtardan standart HKDF ile türetilir.
* **Erken Doğrulama:** Yanlış parola girildiğinde, KDF aşamasının ardından şifreli gövde işlenmeden/çözülmeden erkenden reddedilir.
* **Best-Effort Bellek Temizliği:** Kriptografik ve piksel tamponları işlem bitiminde `fill(0)` ile sıfırlanır (JavaScript immutable string kısıtları için bkz. [THREAT_MODEL.md](docs/THREAT_MODEL.md)).

### 2. Mekânsal Görsel Steganografisi
* **LSB Matching ($\pm 1$ Embedding):** Klasik yerine koyma yönteminin Değer Çiftleri (PoVs) asimetrisini ve $R_M < R_{-M}$ kaymasını **büyük ölçüde azaltır** (ampirik sonuçlar için bkz. [BENCHMARK.md](docs/BENCHMARK.md)).
* **İçerik Duyarlı Adaptif Doku Dağıtımı:** 2D Laplacian gradyanı ile hesaplanan yüksek varyanslı pürüzlü alanlara odaklanır; pürüzsüz alanları korur.
* **Deterministik Afin Permütasyon:** Anahtardan türetilen aralarında asal adımlarla RGB piksellerine tekdüze saçılım ($O(1)$ bellek).
* **Web Worker & Saf PngCodec:** Ağır KDF ve piksel işlemleri Worker'a devredilerek ana iş parçacığı bloklanmaz; tamponlar `ArrayBuffer` ile kopyasız aktarılır. Canvas parmak izi bozulmalarını aşmak için W3C standartlarında saf kodlayıcı/çözücü kullanılır.
* **İnkâr Edilebilir Çift Katman (Deneysel):** Tek görsel içine tuzak (decoy) ve gerçek (real) katman yerleştirme imkânı (güvenlik sınırları ve ödünleşimler için bkz. [THREAT_MODEL.md](docs/THREAT_MODEL.md)).

### 3. Metin & QR Steganografisi
* **Sıfır Genişlikli Metin (Zero-Width):** `U+200B` / `U+200C` ikili kodlamasıyla görünmez veri saklama.
* **Emoji Varyasyon Seçici (VariationSelectorEngine):** Sosyal medya ve mesajlaşma filtrelerinin ZWSP'leri temizlemesine karşılık, emojilerin sunumunu belirleyen `VS1–VS16` seçicileriyle filtre dirençli saklama. Doğal emojilerle (`🛡️`, `❤️`) çakışmayı önleyen sihirli başlık protokolü içerir.
* **QR Kod Motoru (QREngine):** UTF-8 `TextEncoder` köprüsüyle kayıpsız sıfır-genişlikli karakter aktarımı; Chromium `BarcodeDetector` ve `jsQR` hibrit tarama.

### 4. Adli Bilişim & Steganaliz Laboratuvarı (Forensics Workbench)
* **LSB Röntgeni & İstatistiksel Steganaliz:** Bit 0 / Bit 1 düzlem görselleştirmesi, Westfeld Pairs of Values $\chi^2$ testi, Fridrich RS analizi ve $32 \times 32$ blok kayan pencere ısı haritası.
* **İkili Yapı & Dosya Triyajı (Binary Inspector):** PNG chunk CRC-32 doğrulaması, dosya sonu (IEND/EOI) fazlalık veri (overlay/trailing) tespiti ve tek tıkla yük dışa aktarımı.
* **Görsel Fark Analizi (DiffEngine):** MSE, PSNR, SSIM metrikleri ve altın sarısı LSB değişim haritası.
* **Genişletilmiş Karakter Triyajı (ZeroWidthDetector):** Sıfır genişlik, VS1–VS256, BiDi Truva Atı (`U+202E` RLO vb.), görünmez matematik/format, satır sonu boşluk (SNOW) tespiti ve tek tıkla arındırma.
* **zsteg Derin Tarama:** 56 kanal, bit derinliği ve yön kombinasyonunda otomatik imza ve CTF bayrak taraması.

---

> [!IMPORTANT]
> **İletim Kanalı Kuralı:** Taşıyıcı PNG görselleri WhatsApp, Telegram, Signal gibi platformlar üzerinden iletilirken kesinlikle **"Fotoğraf"** olarak değil, **"Belge / Dosya (Kayıpsız)"** seçeneğiyle gönderilmelidir. Kayıplı sıkıştırma (JPEG/WebP) en alt bitleri tahrif eder.

---

## 🚀 Hızlı Başlangıç

### Gereksinimler
* Node.js $\ge 20$
* npm $\ge 10$

```bash
# Bağımlılıkları kurun
npm ci

# Canlı geliştirme sunucusunu başlatın (http://localhost:5173)
npm run dev

# Üretim derlemesi oluşturun (dist/)
npm run build

# Vitest birim testlerini çalıştırın
npm test

# TypeScript statik tip denetimi
npm run typecheck
```

---

## 📁 Teknik Dokümantasyon

| Belge | Kapsam |
|---|---|
| [THREAT_MODEL.md](docs/THREAT_MODEL.md) | Tehdit modeli, saldırgan sınıfları, Kerckhoffs ilkesi ve inkâr edilebilirlik sınırları. |
| [FORMAT.md](docs/FORMAT.md) | Format v1, Format v2, Format v3 tel formatları ve ikili test vektörleri. |
| [BENCHMARK.md](docs/BENCHMARK.md) | LSB Replacement vs LSB Matching karşılaştırmalı $\chi^2$ ve RS tespit oranları. |
| [SECURITY.md](SECURITY.md) | Güvenlik politikası, sürüm desteği ve sorumlu açık bildirimi (responsible disclosure). |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Üçüncü taraf kütüphane lisans bildirimleri (jsQR, qrcode-generator, hash-wasm). |
| [VENDOR.md](docs/VENDOR.md) | Üçüncü taraf bağımlılık envanteri ve doğrulanmış SHA-256 özetleri. |

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) kapsamında sunulmaktadır. Üçüncü taraf lisans bildirimleri için [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) dosyasına bakınız.