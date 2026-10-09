# Güvenlik Politikası ve Sorumlu Açık Bildirimi (SECURITY.md)

StegoCrypt, açık kaynaklı ve istemci taraflı çalışan bir steganografi ve adli bilişim projesidir. Güvenlik, projenin temel önceliğidir.

---

## 1. Desteklenen Sürümler

| Sürüm | Durum |
|---|---|
| 3.x (Master / Geliştirme) | Aktif Destek |
| 2.x (Önceki Sürüm) | Kritik Güvenlik Düzeltmeleri |
| < 2.0 | Desteklenmiyor |

---

## 2. Güvenlik Açığı Bildirimi (Responsible Disclosure)

Eğer StegoCrypt üzerinde bir güvenlik açığı, kriptografik zafiyet, yan kanal sızıntısı veya veri ifşası riski tespit ederseniz:

1. **Lütfen bulgunuzu herkese açık bir GitHub Issue olarak paylaşmayın.**
2. Güvenlik raporunuzu doğrudan GitHub repository üzerinden **Security Advisory (Gizli Açık Bildirimi)** oluşturarak iletin:
   - Repository sekmesinde **Security > Advisories > Report a vulnerability** seçeneğini kullanın.
   - Alternatif olarak doğrudan repository yöneticisi ile iletişime geçin.

### Bildirimde Yer Alması Gerekenler:
- Zafiyetin türü (Kriptografik, Steganaliz manipülasyonu, Bellek sızıntısı, XSS/CSP bypass vb.)
- Yeniden üretme adımları (Proof of Concept - PoC)
- Etkilenen bileşenler (örn. `CryptoEngine.js`, `PngCodec.js`, `StegoEngine.js`)
- Olası etki ve önerilen çözüm/yama

---

## 3. Yanıt ve Koordinasyon Süreci

- **İlk Yanıt:** Bildiriminiz 48 saat içinde incelenir ve alındığı teyit edilir.
- **Değerlendirme:** Zafiyetin teknik analizi ve risk derecelendirmesi en geç 5 iş günü içinde tamamlanır.
- **Yama ve Dağıtım:** Onaylanan açıklar için yama hazırlanır, test edilir ve kamuya duyurulmadan önce yeni sürümle dağıtılır.
- **Atıf (Credits):** Güvenlik araştırmacıları, talepleri doğrultusunda sürüm notlarında ve güvenlik bildiriminde açıkça teşekkür edilerek onurlandırılır.
