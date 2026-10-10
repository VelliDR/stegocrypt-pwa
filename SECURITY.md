# Güvenlik Politikası ve Sorumlu Açık Bildirimi (SECURITY.md)

StegoCrypt, açık kaynaklı ve tamamen istemci taraflı (client-side) çalışan bir steganografi ve adli bilişim araştırma aracıdır.

---

> [!CAUTION]
> **Sorumluluk Reddi:**  
> Bu yazılım eğitim, araştırma ve test amacıyla geliştirilmiştir. **Bağımsız bir üçüncü taraf güvenlik veya kriptografi denetiminden (third-party security audit) geçmemiştir.** Hayati tehlike, muhbirlik veya yüksek operasyonel güvenlik (OPSEC) gerektiren hassas kullanım senaryoları için uygun değildir.

---

## 1. Desteklenen Sürümler

Uygulama sürümü ile veri/tel formatı (wire format) sürümleri birbirinden bağımsızdır:

### Uygulama Kod Tabanı
| Sürüm | Durum | Açıklama |
|---|---|---|
| **v3.1.x (Master)** | Aktif Destek | Vite + TypeScript ana sürümü. Güvenlik ve özellik güncellemeleri yalnızca bu dala uygulanır. |
| **v3.0.x (Legacy JS)** | Donduruldu | `v3.0.0-legacy-js` etiketiyle arşivlenmiştir. Aktif bakım yapılmamaktadır. |
| **< v3.0** | Desteklenmiyor | Eski sürümler. |

### Desteklenen Paket / Tel Formatları (Wire Formats)
Uygulama, çözücü seviyesinde geriye dönük uyumluluk sunar:
- **Format v3:** Argon2id / tekil KDF + HKDF-Expand, taze tuz/IV, LSB matching ve adaptif kafes doku.
- **Format v2:** Sıfır-İmza (Zero-Signature), 100k PBKDF2 dağınık saçılım.
- **Format v1:** Sıralı (Sequential, `STG1`/`STG2`) legacy paketler.

---

## 2. Güvenlik Açığı Bildirimi (Responsible Disclosure)

Eğer StegoCrypt üzerinde bir kriptografik zafiyet, yan kanal sızıntısı, bellek açığı veya XSS/CSP baypas riski tespit ederseniz:

1. **Lütfen bulgunuzu herkese açık bir GitHub Issue olarak açmayın.**
2. Tercih edilen yöntem: GitHub repository üzerinden **Security Advisory (Gizli Açık Bildirimi)** oluşturmaktır:
   * Repository ana sayfasında **Security > Advisories > Report a vulnerability** adımlarını izleyin.
3. Alternatif doğrudan iletişim: Proje yöneticisine e-posta gönderin:
   * **E-posta:** `veliozkul45@gmail.com`

### Bildirimde Yer Alması Gerekenler:
* Zafiyetin türü ve teorik risk derecesi
* Yeniden üretme adımları veya kavram kanıtı (Proof of Concept - PoC)
* Etkilenen modüller (örn. `CryptoEngine.ts`, `PngCodec.ts`, `StegoEngine.ts`)
* Varsa önerilen iyileştirme veya yama

---

## 3. Yanıt ve Koordinasyon Süreci

Bu proje bağımsız bir geliştirici tarafından sürdürülmektedir:
* **İlk Yanıt:** Bildirimler en iyi çaba esasıyla (*best-effort*) birkaç iş günü içinde incelenir ve alındığı teyit edilir.
* **Değerlendirme & Yama:** Doğrulanan açıklar için öncelikli olarak bir düzeltme hazırlanır, test edilir ve yeni bir sürümle yayımlanır.
* **Atıf (Credits):** Güvenlik araştırmacıları, talepleri doğrultusunda sürüm notlarında ve güvenlik duyurularında açıkça onurlandırılır.
