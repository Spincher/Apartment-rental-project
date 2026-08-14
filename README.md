# بيت لقطة — V8

## الجديد
- تحديد موقع العقار بإحداثيات Latitude / Longitude.
- زر لاستخدام موقع الجهاز الحالي كإحداثيات للعقار.
- زر يفتح Google Maps على المكان المحدد.
- معاينة Google Maps داخل صفحة إضافة العقار.
- حفظ إحداثيات الموقع في SQLite.
- صفحة تفاصيل العقار تعرض Google Maps داخل مستطيل مع الموقع المحدد.
- زر لفتح الموقع مباشرة في Google Maps.
- كل مزايا V7 السابقة ما زالت موجودة: معرض صور متعدد، AI valuation، التوقعات، الرسائل، الحساب، الفلاتر، Dark Mode، والفوتر.

## التشغيل
```bash
npm install
npm start
```
ثم افتح `http://localhost:3000`.

### ملاحظة عن Google Maps
النسخة تستخدم Google Maps embed/link بدون إدخال API key داخل المشروع. لتحديد نقطة دقيقة، اكتب Latitude و Longitude، أو استخدم موقع جهازك، ثم حدّث الخريطة. يمكن أيضًا فتح Google Maps مباشرة من الزر.

<img width="941" height="1672" alt="photo_2026-08-12_16-02-58" src="https://github.com/user-attachments/assets/85727664-24ee-4049-838e-be425113d58f" />
<img width="1280" height="853" alt="photo_2026-08-12_16-59-04" src="https://github.com/user-attachments/assets/7e61d2c4-de26-4625-97a8-ef6b56c8934c" />

