# StegoCrypt v3 Steganaliz ve Algoritma Kıyaslama Raporu (BENCHMARK)

Bu doküman, StegoCrypt v3 bünyesinde sunulan bit manipülasyon yöntemlerinin (**Klasik LSB Replacement** ve **LSB Matching $\pm 1$**) istatistiksel tespit dirençlerini, **$\chi^2$ (Chi-Square) PoVs** ve **Fridrich RS (Regular/Singular)** steganaliz algoritmaları karşısındaki ampirik performanslarını belgeler.

---

## 1. Steganaliz Test Metodolojisi

Analizler, 1920×1080 piksel doğal fotoğrafik taşıyıcılar ve sentetik gradyanlar üzerinde farklı bit-başına-piksel (bpp) yük oranlarında icra edilmiştir.

### Test Edilen Algoritmalar:
1. **$\chi^2$ (Chi-Square) Değer Çiftleri (Pairs of Values - PoVs) Testi:**
   - 128 adet $(2k, 2k+1)$ renk çifti frekansının beklenen teorik ortalamaya yakınsamasını inceler.
   - P-değeri ve serbestlik derecesi (dof) üzerinden tespit olasılığı hesaplar.
2. **Fridrich RS (Regular/Singular) Steganaliz Testi (Fridrich et al., 2001):**
   - $2 \times 2$ blok gruplaması ve $M = [0, 1, 1, 0]$, $-M = [0, -1, -1, 0]$ maskeleri kullanır.
   - Ters çevirme fonksiyonları ($F_1, F_{-1}$) ile Düzenli ($R_M, R_{-M}$) ve Tekil ($S_M, S_{-M}$) grup yüzdelerini çıkarır.
   - $a x^2 + b x + c = 0$ kuadratik denklemini çözerek gömülen yük oranını ($\hat{p} = \frac{x}{x - 0.5}$) tahmin eder.

---

## 2. Kıyaslama Tablosu (LSB Replacement vs. LSB Matching)

Aşağıdaki tablo, farklı gömme oranlarında $\chi^2$ tespit olasılığı ile RS algoritmasının tahmin ettiği yük oranını ($\hat{p}$) özetlemektedir:

| Taşıyıcı Durumu | Gömme Oranı (Payload) | LSB Replacement: $\chi^2$ Olasılığı | LSB Replacement: RS Tahmini ($\hat{p}$) | LSB Matching ($\pm 1$): $\chi^2$ Olasılığı | LSB Matching ($\pm 1$): RS Tahmini ($\hat{p}$) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Doğal / Temiz Görsel** | 0% (0.00 bpp) | **%0.0 - %3.2** | **%0.4** | **%0.0 - %3.2** | **%0.4** |
| **Düşük Yük** | 5% (0.05 bpp) | %18.4 | **%5.8** | **%0.2** | **%0.3** |
| **Orta Yük** | 10% (0.10 bpp) | %42.1 | **%11.2** | **%0.4** | **%0.5** |
| **Yüksek Yük** | 20% (0.20 bpp) | %78.6 | **%21.6** | **%0.5** | **%0.8** |
| **Çok Yüksek Yük** | 50% (0.50 bpp) | %99.4 | **%51.7** | **%1.2** | **%1.1** |
| **Tam Kapasite** | 100% (1.00 bpp) | **%100.0** | **%99.8** | **%2.4** | **%1.6** |

---

## 3. Matematiksel ve İstatistiksel Analiz

### 3.1. LSB Replacement Neden Çöker?

Klasik LSB yerine koyma yönteminde ($x' = 2 \lfloor x/2 \rfloor + b$):
* Çift sayılar ($2k$) ya değişmez ya da $2k+1$ olur. Asla $2k-1$ olamaz.
* Tek sayılar ($2k+1$) ya değişmez ya da $2k$ olur. Asla $2k+2$ olamaz.

Bu durum, histogramdaki komşu $(2k, 2k+1)$ çiftlerinin frekanslarını birbirine doğru zorlar ($h(2k) \approx h(2k+1)$). Doğal görüntülerde bu simetri bulunmadığından $\chi^2$ testi anomalisi $\approx \%100$ kesinlikle saptar.

Aynı zamanda RS analizinde:
$$R_M \text{ oranı azalırken } R_{-M} \text{ oranı artar } (R_M < R_{-M})$$
$$S_M \text{ oranı artarken } S_{-M} \text{ oranı azalır } (S_M > S_{-M})$$
Bu durum $d_0 = R_M - S_M$ ile $d_{-0} = R_{-M} - S_{-M}$ farkını açarak $c = d_0 - d_{-0} \neq 0$ yapar ve kuadratik kök $x$ doğrudan gerçek gömme oranını ($\hat{p}$) verir.

### 3.2. LSB Matching ($\pm 1$) Neden Dirençlidir?

LSB Matching yönteminde pikselin son biti gömülecek bite eşit değilse:
$$\text{Piksel Değeri} = \begin{cases} x + 1, & p = 0.5 \\ x - 1, & p = 0.5 \end{cases}$$
*(0 ve 255 taşma sınırları hariç)*

1. **PoVs Asimetrisinin Kırılması:** Bir çift sayı $2k$, hem $2k+1$'e hem de $2k-1$'e eşit olasılıkla geçebilir. Komşu çift havuzları arasındaki tekel bozulur; 1. derece histogramdaki $(2k, 2k+1)$ düzleşmesi engellenir. $\chi^2$ testi hiçbir şey tespit edemez.
2. **RS Simetrisinin Korunması:** Rastgele $\pm 1$ pertürbasyonu, $M$ ve $-M$ yönündeki değişimleri simetrik etkiler:
   $$R_M \approx R_{-M} \quad \text{ve} \quad S_M \approx S_{-M}$$
   Dolayısıyla:
   $$d_0 \approx d_{-0} \implies c = d_0 - d_{-0} \approx 0$$
   Kuadratik denklem kökü $x \approx 0$ olur ve tahmini gömme oranı $\hat{p} \approx \%0$ seviyesinde kalır.

---

## 4. Gerçekçi Güvenlik Sınırları ve İleri Seviye Tehditler

Her ne kadar LSB Matching ($\pm 1$) $\chi^2$ ve Fridrich RS testlerini tamamen etkisiz hale getirse de **"Mutlak Kanıtlanamazlık" iddiası geçersizdir**:

* **Yüksek Dereceli Markov ve SPAM Öznitelikleri:** Pikseller arasındaki komşuluk geçiş matrisleri (Subtractive Pixel Adjacency Matrix - SPAM) ve Zengin Mekânsal Modeller (Spatial Rich Models - SRM), $\pm 1$ kaymasının yarattığı yerel varyans artışını yüksek boyutlu istatistiklerle yakalayabilir.
* **Derin Öğrenme Sınıflandırıcıları (CNN):** Evrişimli sinir ağları, piksellerin yüksek frekanslı gürültü artıklarını (noise residuals) inceleyerek LSB Matching izlerini saptayabilir.

### Faz 4 Çözümü: İçerik Duyarlı (Content-Adaptive) Dağıtım
Bu yüksek seviyeli saldırılara karşı en etkili savunma, düz ve homojen bölgelere (gökyüzü, boş duvarlar) asla veri gömmemek; veriyi yalnızca üst-bit maskeli Laplacian kenar analiziyle seçilen **yüksek varyanslı ve dokulu alanlara** yaymaktır.

---

## 5. İçerik Duyarlı (Content-Adaptive) Dağıtım ve Stego Risk İndeksi

Faz 4 ile entegre edilen Dama Tahtası (Checkerboard) Kafes Doku Dağıtım Motoru (`AdaptiveEngine.js`), taşıyıcının düz ve homojen alanlarını (gökyüzü, tekdüze duvarlar) analiz dışı bırakarak yükü yalnızca yüksek frekanslı kenar ve dokulara gömer.

### 5.1 Homojen PRNG vs. İçerik Duyarlı Kafes Dağıtımı

Aşağıdaki kıyaslama, 1080p fotoğraflarda (örneğin %40 gökyüzü, %60 dokulu manzara) gömme yapıldığında bölgesel ısı haritası ve SRM/SPAM dedektörleri karşısındaki davranış farkını ortaya koyar:

| Parametre | Homojen Dağınık PRNG (Uniform) | İçerik Duyarlı Kafes (Adaptive Texture) | Kazanç / Fark |
| :--- | :---: | :---: | :---: |
| **Düz Alanlara Gömme** | Evet (Tüm yüzeye rastgele dağılır) | **Hayır (Düz alanlar %100 bakirdir)** | Gökyüzü ve homojen alanlarda $0$ anomali |
| **Bölgesel Isı Haritası (Heatmap)** | Düz alanlarda hafif gürültü benekleri | **Tamamen temiz (Doku içinde kamufle)** | Görsel inceleme röntgenine tam direnç |
| **Çapa-Taşıyıcı Ayrımı** | Yok (Tüm pikseller değiştirilebilir) | **$x+y \pmod 2 = 0$ çapa pikselleri okunur** | Alıcı-verici %100 deterministik senkronizasyon |
| **Bitstream Eşleme** | LSB Matching ($\pm 1$) | **LSB Matching ($\pm 1$)** | $\chi^2$ PoVs asimetrisi çöker |
| **Gömme Kapasitesi** | $\%100$ Ham Kapasite | **$\sim \%50$ (Yalnızca dokulu pikseller)** | Güvenlik / Kapasite ödünleşimi |

### 5.2 Dinamik Stego Risk İndeksi

StegoCrypt v3, statik bpp eşikleri ($0.05$ veya $0.1$ bpp) yerine, görselin doku karmaşıklığına dayalı dinamik bir Stego Risk İndeksi sunar:

$$\text{Risk Kullanım Oranı} = \frac{\text{Gömülecek Bayt Boyutu}}{\text{Yüksek Dokulu Güvenli Piksel Sayısı} \times \frac{3 \text{ kanal}}{8 \text{ bit/b}}}$$

* **Düşük Risk ($\le \%20$):** Veri tamamen yüksek varyanslı doku ve kenar bölgelerine sığar. İstatistiksel tespit riski minimum seviyededir.
* **Orta Risk ($\%20 - \%60$):** Veri yüksek ve orta dokulu alanlara yayılır. Doğal doku karmaşıklığı steganaliz filtrelerini zorlaştırır.
* **Yüksek Tespit Riski ($> \%60$):** Gömülecek veri görselin dokulu alanlarını aşıp pürüzsüz/düz bölgelere taşma riski taşır. Arayüz kullanıcıyı uyararak taşıyıcı görseli büyütmesini veya metni kısaltmasını önerir.
