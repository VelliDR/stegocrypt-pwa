# 🌿 StegoCrypt PWA

<div align="center">

![StegoCrypt Banner](icon-192.png)

### İstemci Taraflı İstatistiksel Dirençli Steganografi, Kriptografi & Adli Bilişim Platformu

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests: Passing](https://img.shields.io/badge/Tests-21%20Unit%20%7C%208%20E2E%20Passed-brightgreen.svg)](#-test-ve-do%C4%9Frulama)
[![PWA Ready](https://img.shields.io/badge/PWA-100%25%20Offline-brightgreen.svg)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![Security: AES-256-GCM](https://img.shields.io/badge/Security-AES--256--GCM-success.svg)](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
[![KDF: PBKDF2-SHA256](https://img.shields.io/badge/KDF-PBKDF2--100k%2F600k-orange.svg)](https://en.wikipedia.org/wiki/PBKDF2)
[![Zero-Server](https://img.shields.io/badge/Privacy-100%25%20Client--Side-purple.svg)](#-gizlilik-ve-tehdit-modeli)

*Görsellerde en önemsiz bit (LSB) manipülasyonu, istatistiksel dağıtım, χ² steganaliz röntgeni ve görünmez metin şifreleme.*

</div>

---

## 📖 Genel Bakış

**StegoCrypt**, modern web platformu standartları (Web Crypto API, Streams API, OffscreenCanvas/Canvas, Service Worker) üzerinde çalışan, **%100 istemci tarafında (client-side)** ve sunucusuz (**zero-server**) bir steganografi ve adli bilişim (forensics) web uygulamasıdır.

Klasik steganografi araçlarının aksine açık metin dosya imzaları (`STEG`, `BM` vb.) bırakmaz; rastgeleleştirilmiş entropi başlığı, **kriptografik PRNG afin permütasyonu** ve **çift katmanlı inkâr edilebilir şifreleme** mimarisi içerir. Ayrıca adli analiz sekmesinde **LSB Bit Düzlemi Röntgeni** ve **Westfeld Pairs of Values $\chi^2$ Steganaliz Testi** ile taşıyıcı görsellerin istatistiksel anomalilerini raporlar.

Tasarımı, **Material 3 (Adaçayı Yeşili & Mat Kömür)** prensipleriyle kodlanmış olup masaüstü ve mobil ekranlarda duyarlı çalışır.

---

## 🛡️ Kriptografik ve Bilgi Teorisi Mimarisi

```mermaid
flowchart LR
    subgraph Girdi ["1. Veri Hazırlığı"]
        A["Gizli Metin / Dosya"] --> B["Streams API Deflate\n(2x - 5x Sıkıştırma)"]
    end
    subgraph Kripto ["2. Kriptografik Zırh"]
        B --> C["PBKDF2-HMAC-SHA256\nAES-256-GCM (256-bit)"]
        C --> D["Sıfır İmza Başlığı (64B)\nRastgele Entropi Bloğu"]
    end
    subgraph Stego ["3. Mekânsal Dağıtım"]
        D --> E["PRNG Aralarında Asal Adım\nO(1) Bellek Permütasyonu"]
        E --> F["Kanal Bölümleme\n(Even: Tuzak / Odd: Gerçek)"]
        F --> G["1-LSB / 2-LSB\nOpaklaştırılmış PNG"]
    end
```

### 1. Kimlik Doğrulamalı Simetrik Kriptografi (AES-256-GCM)
* **AES-256-GCM:** Kimlik doğrulamalı şifreleme (AEAD) ile hem gizlilik hem de bütünlük/özgünlük doğrulaması sağlanır.
* **Standart KDF Parametreleri:** Web Crypto API yerel PBKDF2-HMAC-SHA256 anahtar türetimi.
* **Taze Entropi:** Her şifrelemede `crypto.getRandomValues` ile 16 baytlık kriptografik rastgele **Salt** ve 12 baytlık **IV** üretilir.
* **Sıfır İmza (Zero-Signature):** Dosyada açık metin sihirli bayt (`magic string`) bulunmaz. 64 baytlık başlık (Salt + IV Meta + Şifreli Meta + IV Body) tekdüze sözde-rastgele bayt dizisi görünümündedir ($H \approx 8.0$ bit/bayt).
* **Erken Doğrulama:** 24 baytlık şifreli metadata bloğu AES-GCM kimlik doğrulama etiketiyle kilitlidir. Yanlış parola girildiğinde gövde verisi işlenmeden anında hata üretilerek DoS ve bellek tükenmesi (OOM) önlenir.

### 2. İstatiksel İnceleme Direnci & LSB Dağıtımı
* **PRNG Afin Saçılım:** Veri piksellerin başından itibaren sıralı gömülmez; tohumdan türetilen aralarında asal adımlarla ($O(1)$ bellek tüketimi) görselin tüm RGB kanallarına homojen dağıtılır.
* **1-LSB & 2-LSB Seçimi:** Yüksek istatistiksel direnç için 1-LSB; yüksek taşıma kapasitesi için 2-LSB modu.
* **Kayıpsız PNG & Canvas Alfa Düzleştirme:** Şeffaf PNG taşıyıcılarda premultiplied alpha kaynaklı RGB bozulmasını önlemek için alfa kanalı opaklaştırılır ve $\alpha = 255$ sabitlenir.
* **Canvas Farbling Öz-Testi:** Açılışta test deseni çizilerek Brave Shields, Firefox RFP veya gizlilik eklentilerinin canvas verilerine gürültü ekleyip eklemediği denetlenir.

### 3. Deneysel / Yüksek Riskli İnkâr Modu (Plausible Deniability)
* Tek bir görsel içerisine iki bağımsız şifreli katman gömülür:
  * **Tuzak Katman (Decoy):** Baskı/zorlama anında teslim edilebilecek zararsız kılıf veri (`even` kanalları).
  * **Gerçek Katman (Real):** Asıl gizli veri (`odd` kanalları).
* > [!WARNING]
  > **Tespit Edilebilirlik vs. İnkâr Edilebilirlik Ödünleşimi (Trade-off):**
  > 1. Tuzak parolanın teslim edilmesi, adli analizciye görselin steganografi taşıdığını resmen bildirir.
  > 2. Tek kanallar boş bırakılırsa, çift ve tek kanallar arasındaki yerel varyans/entropi asimetrisi ikinci katmanın varlığına dair şüphe yaratabilir.
  > 3. Tek kanallar yapay gürültüyle doldurulursa, taşıyıcının tamamı manipüle edilmiş olacağından $\chi^2$ veya RS testleri gömmeyi doğrudan tespit edebilir.
  > Ayrıntılı analiz için [THREAT_MODEL.md](docs/THREAT_MODEL.md) belgesini inceleyin.

### 4. Bellek Sıfırlama Gerçekliği (Best-Effort Zeroization)
* Kriptografik ve piksel tamponları işlem tamamlandığında `Uint8Array.fill(0)` ile sıfırlanır.
* Ancak JavaScript çalışma zamanında (V8 / SpiderMonkey) HTML form alanlarından okunan parola string'leri heap bellekte immutable (değiştirilemez) nesneler olarak yaşar ve Garbage Collector (GC) temizleyene kadar RAM dökümünde kalabilir. İddia **"Best-Effort Memory Zeroization"** düzeyindedir.

---

## 📡 İletim Kanalı Kuralı (Carrier Channel Rule)

> [!IMPORTANT]
> **Kanal Kuralı:** Taşıyıcı PNG görselleri WhatsApp, Telegram, Signal gibi platformlar üzerinden iletilirken kesinlikle **"Fotoğraf"** olarak değil, **"Belge / Dosya (Kayıpsız)"** seçeneğiyle gönderilmelidir.
> Sosyal ağlar fotoğrafları kayıplı (lossy JPEG/WebP) olarak sıkıştırdığında piksellerin en önemsiz bitleri $\%40-\%60$ oranında bozulur ve mekânsal alanda hiçbir veri kurtarılamaz.

---

## 🔬 Adli Bilişim & Steganaliz Röntgeni

Uygulamanın **🔬 Steganaliz** sekmesi iki temel adli bilişim aracı sunar:
1. **LSB Bit Düzlemi Röntgeni:** Bit 0 ve Bit 1 düzlemlerini RGB veya tekil renk kanalları (Kırmızı, Yeşil, Mavi) bazında ayrıştırıp görselleştirir.
2. **Westfeld Pairs of Values $\chi^2$ Testi:** Değer çiftlerinin ($2k, 2k+1$) frekans dağılımını ölçerek Wilson-Hilferty normalleştirilmiş dönüşümüyle LSB manipülasyon olasılığını ve $p$-değerini raporlar.

---

## 🧪 Test ve Doğrulama

Proje, hem Node.js yerel test ortamında birim testleriyle hem de Playwright ile gerçek Chromium tarayıcısında uçtan uca (E2E) test edilmektedir.

```bash
# Bağımlılıkları yükleyin
npm install

# 1. Birim Testleri (Crypto, Compression, Scatter, Stego, Steganalysis, ZeroWidth)
npm run test:unit

# 2. Tarayıcı Uçtan Uca (E2E) Testleri (Playwright + Chromium)
npm run test:e2e
```

**Mevcut Test Durumu:**
- **21 / 21** Birim Testi Başarılı (`node:test`, 560 ms)
- **8 / 8** E2E Tarayıcı Testi Başarılı (Strict CSP, Şeffaf PNG, Dosya Gömme, İnkâr Modu, HEIC/HEIF entegrasyonu)

---

## 📁 Teknik Dokümantasyon

- [THREAT_MODEL.md](docs/THREAT_MODEL.md) — Kerckhoffs ilkesi, saldırgan sınıfları, koruma sınırları ve kanal rehberi.
- [FORMAT.md](docs/FORMAT.md) — Format v1 (sıralı), Format v2 (sıfır imza dağınık) ve Format v3 spesifikasyonu ve test vektörleri.
- [SECURITY.md](SECURITY.md) — Güvenlik politikası ve sorumlu açık bildirimi (responsible disclosure).
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — Lisans bildirimleri (heic2any MIT, libheif LGPL-3.0, jsQR Apache-2.0, qrcode-generator MIT).
- [VENDOR.md](docs/VENDOR.md) — Bağımlılık envanteri ve doğrulanmış SHA-256 kriptografik özetleri.

---

## 🚀 Yerel Çalıştırma

StegoCrypt tamamen statik web varlıklarından oluşur.

```bash
# Python ile:
python3 -m http.server 8080

# veya Node.js ile:
node tests/helpers/static-server.js
```

Tarayıcınızda `http://localhost:8080` adresini açın. PWA özellikleri için Service Worker otomatik devreye girer.

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında sunulmuştur. Üçüncü taraf kütüphane bildirimleri için [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) dosyasına bakınız.