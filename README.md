# 🌿 StegoCrypt PWA

**StegoCrypt**, istemci tarafında (*client-side*) çalışan, sunucusuz (*zero-server*), görsel steganografisi ve görünmez metin şifreleme uygulamasıdır. 

Material 3 (Adaçayı Yeşili & Mat Siyah) tasarım diline sahip, saf **Vanilla JavaScript** ile geliştirilmiş hafif bir **PWA (Progressive Web App)**'dir.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-131614.svg)
![Security-AES--GCM--256-brightgreen](https://img.shields.io/badge/Security-AES--256--GCM-success)

---

## ✨ Özellikler

- **🔒 %100 İstemci Tarafı & Çevrimdışı (Zero-Server):** Verileriniz asla bir sunucuya gönderilmez. Tüm şifreleme işlemleri cihazınızın RAM'inde gerçekleşir.
- **🛡️ Askeri Sınıf Kriptografi:** 
  - **AES-GCM-256** simetrik şifreleme.
  - **PBKDF2** (100.000 iterasyon + SHA-256) anahtar türetme.
  - Her işlemde rastgele üretilen 16-byte **Salt** ve 12-byte **IV**.
- **🖼️ LSB Görsel Steganografisi:** Gizli metin veya dosyaları PNG piksellerinin en son bitlerine (LSB) fark edilmeyecek şekilde gömer.
- **📁 Görsele Dosya Gömme:** Görsel piksellerinin içine sadece metin değil; `.pdf`, `.zip`, `.txt` gibi her türlü dosyayı şifreleyerek saklar.
- **👻 Görünmez Metin Modu (Zero-Width Unicode):** Görsel yüklemeden, şifreli veriyi görünmez Unicode karakterlerine (`\u200B`, `\u200C`) çevirir. WhatsApp veya Telegram sıkıştırmalarından etkilenmez.
- **📱 PWA Desteği:** Masaüstü ve mobil cihazlara bir uygulama gibi yüklenebilir, internet bağlantısı olmadan uçak modunda çalışır.
- **🧹 Otomatik Bellek Temizliği:** Şifreleme tamamlandığında veya metin panoya kopyalandığında hassas değişkenler RAM'den ve DOM'dan otomatik olarak sıfırlanır.
⚠️ Sorumluluk Reddi (Disclaimer)

Bu proje sadece eğitim, siber güvenlik araştırmaları ve eğlence amacıyla geliştirilmiştir. Yasalara aykırı eylemlerde kullanılması durumunda tüm sorumluluk kullanıcıya aittir.
📄 Lisans

Bu proje MIT Lisansı ile lisanslanmıştır. Dilediğiniz gibi değiştirebilir, özgürce dağıtabilir ve kendi projelerinizde kullanabilirsiniz.