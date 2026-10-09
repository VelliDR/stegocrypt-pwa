# Vendor Kütüphane Envanteri ve Bütünlük Doğrulaması (VENDOR.md)

Bu belgede `stegocrypt-pwa` projesinde kullanılan tüm üçüncü taraf istemci kütüphanelerinin sürümleri, menşe kaynakları, lisansları ve SHA-256 kriptografik özet değerleri listelenmiştir.

---

## 1. Kütüphane Listesi

| Kütüphane | Sürüm | Dosya Yolu | Lisans | Menşe (Upstream) |
|---|---|---|---|---|
| **heic2any** | 0.0.4 | `js/vendor/heic2any.min.js` | MIT (bundled libheif: LGPL-3.0) | [alexcorvi/heic2any](https://github.com/alexcorvi/heic2any) |
| **jsQR** | 1.4.0 | `js/vendor/jsQR.js` | Apache-2.0 | [cozmo/jsQR](https://github.com/cozmo/jsQR) |
| **qrcode-generator** | 1.4.4 (ESM wrap) | `js/vendor/qrcode.mjs` | MIT | [kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) |

---

## 2. SHA-256 Kriptografik Sağlama Değerleri (Checksums)

Dosyaların bütünlüğünü doğrulamak için terminalde `sha256sum js/vendor/*` komutunu çalıştırabilirsiniz:

```text
0963cfa50e9e1e7e6af929a40a81e3e898a673f1270eafa6917dd137e4968164  js/vendor/heic2any.min.js
bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859  js/vendor/jsQR.js
ea91d7118a5395289170da848b7c6758b996163bfbccf312591ab65a4911b7c0  js/vendor/qrcode.mjs
```

---

## 3. Güvenlik ve Bağımsızlık İlkesi

- Projede hiçbir CDN veya dış sunucu bağlantısı (`connect-src`, harici `script-src`) bulunmamaktadır.
- Tüm üçüncü taraf bağımlılıklar yerel dosya sistemindedir, Service Worker ile çevrimdışı önbelleklenir ve CSP `default-src 'self'` politikasıyla sınırlandırılmıştır.
- Paketlerde herhangi bir telemetri, analitik izleme veya harici ağ çağrısı bulunmamaktadır.
