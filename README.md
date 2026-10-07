# EXS — Scientific Web Editor

EXS, bilimsel ve teknik belgeleri doğrudan tarayıcıda hazırlamak için geliştirilen **WYSIWYG bilimsel belge editörüdür**. Projenin esin noktası Symbol Dynamics EXP'in metin ve matematiği aynı belge içinde hızlı biçimde düzenleme yaklaşımıdır; EXS bağımsız bir web uygulamasıdır ve EXP kaynak kodunu, dosya biçimini veya arayüz varlıklarını içermez.

## İlk sürümde neler var?

- A4 benzeri WYSIWYG belge çalışma alanı
- Metin biçimlendirme ve başlık stilleri
- Belge içine gömülü, doğrudan düzenlenebilir MathLive matematik alanları
- Satır içi matematik
- Otomatik numaralanan display denklemleri
- Denklem etiketleri ve LaTeX `\\label{eq:...}` çıktısı
- Kesir, kök, integral, toplam, limit, türev ve matris şablonları
- Yunan harfleri ve temel bilimsel sembol paleti
- Tablo ve yerel görsel ekleme
- Otomatik içindekiler/başlık görünümü
- Denklem listesi
- Bul/değiştir
- Tarayıcı `localStorage` üzerinde otomatik kayıt
- `.exs` proje dosyası kaydetme/açma
- LaTeX, HTML ve düz metin dışa aktarma
- Tarayıcı yazdırma altyapısı üzerinden PDF çıktısı
- Mobil/dar ekran için temel responsive düzen
- GitHub Pages üzerinde statik çalışma

## Kullanım

Bu sürüm build adımı gerektirmez. Depoyu herhangi bir statik HTTP sunucusuyla açabilirsiniz:

```bash
python3 -m http.server 8080
```

Ardından `http://localhost:8080` adresine gidin.

> Matematik editörü MathLive'ı CDN üzerinden yükler. Matematik alanlarının ilk yüklenmesi için internet bağlantısı gerekir.

## Kısayollar

- `Ctrl/Cmd + S`: EXS proje dosyasını indir
- `Ctrl/Cmd + F`: Bul/değiştir
- `Ctrl/Cmd + Shift + M`: numaralı denklem ekle
- `Ctrl/Cmd + B`: kalın
- `Ctrl/Cmd + I`: italik

## Proje dosyası

`.exs` dosyası JSON tabanlıdır ve şu temel alanları içerir:

```json
{
  "format": "exs-scientific-document",
  "version": 1,
  "title": "Belge adı",
  "author": "Yazar",
  "updatedAt": "ISO-8601",
  "body": "<p>...</p>"
}
```

İçe aktarılan belge HTML'i güvenlik amacıyla izin verilen etiket ve özniteliklerle sınırlandırılır.

## Bilimsel kullanım için yol haritası

İlk çalışan çekirdekten sonra en anlamlı geliştirmeler:

1. denklem referanslarını (`Eq. (3)`) belge içinde otomatik güncelleyen çapraz referans sistemi,
2. BibTeX / CSL kaynakça ve atıf yöneticisi,
3. gelişmiş tablo editörü ve birim/ölçüm yardımcıları,
4. kimyasal formül ve reaksiyon girişi,
5. şekil/tablo/denklem başlıkları ve otomatik numaralama,
6. MathML ve Typst dışa aktarma,
7. LaTeX içe aktarma,
8. sürüm geçmişi / IndexedDB tabanlı yerel belge kütüphanesi,
9. çevrimdışı PWA ve MathLive varlıklarının yerel paketlenmesi,
10. bilimsel şablonlar (makale, tez, rapor, ders notu).

## Lisans ve marka notu

Symbol Dynamics ve EXP ilgili hak sahiplerinin markalarıdır. Bu proje, web üzerinde bilimsel belge düzenleme fikrini bağımsız olarak uygular ve Symbol Dynamics EXP ile bağlantılı veya onun tarafından onaylanmış değildir.
