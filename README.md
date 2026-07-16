# إدراج الأسماء في PowerPoint من Excel (name_inserter)

نظام بسيط: تعطيه **قالب PowerPoint** فيه مكان محجوز للاسم، و**ملف Excel** فيه قائمة الأسماء،
فيُنشئ لك ملف PowerPoint فيه **شريحة لكل اسم** (أو ملف مستقل لكل اسم). مناسب للشهادات، البطاقات،
كشوف الحضور، وغيرها.

## المتطلبات

```bash
pip install -r requirements.txt
```

## طريقة العمل في 3 خطوات

1. جهّز قالب PowerPoint (`template.pptx`) وضع في مكان الاسم النص المحجوز: `{{name}}`.
2. جهّز ملف Excel (`names.xlsx`) واكتب الأسماء في عمود واحد (عمود واحد يكفي).
3. نفّذ الأمر:

```bash
python name_inserter.py --pptx template.pptx --excel names.xlsx --output result.pptx --has-header
```

الناتج: ملف `result.pptx` فيه شريحة لكل اسم.

> `--has-header` تُستخدم إذا كان الصف الأول في Excel عنوانًا للعمود (مثل «الاسم»)، فيتم تجاهله.

## تجربة سريعة (بدون ملفات جاهزة)

يوجد سكربت ينشئ لك قالبًا وملف أسماء تجريبيًا:

```bash
python make_samples.py                                   # ينشئ template.pptx و names.xlsx
python name_inserter.py --pptx template.pptx --excel names.xlsx --output result.pptx --has-header
```

## الخيارات

| الخيار | الوصف | الافتراضي |
| --- | --- | --- |
| `--pptx` | مسار قالب PowerPoint (مطلوب) | — |
| `--excel` | مسار ملف Excel للأسماء (مطلوب) | — |
| `--output` | ملف الناتج (أو مجلد الناتج مع `--split`) | `result.pptx` |
| `--placeholder` | النص المحجوز داخل القالب | `{{name}}` |
| `--column` | عمود الأسماء: حرف مثل `A` أو رقم مثل `1` | أول عمود |
| `--sheet` | اسم الورقة داخل ملف Excel | أول ورقة |
| `--has-header` | تجاهُل الصف الأول (عنوان العمود) | معطّل |
| `--slide` | رقم شريحة القالب التي تُنسخ | `1` |
| `--split` | إنشاء ملف مستقل لكل اسم بدلًا من ملف واحد | معطّل |

## أمثلة

ملف مستقل لكل اسم داخل مجلد `certificates`:

```bash
python name_inserter.py --pptx template.pptx --excel names.xlsx --output certificates --split --has-header
```

الأسماء موجودة في العمود `B` والورقة اسمها `Data`:

```bash
python name_inserter.py --pptx template.pptx --excel names.xlsx --column B --sheet Data --has-header
```

نص محجوز مختلف (مثلاً `[الاسم]` بدل `{{name}}`):

```bash
python name_inserter.py --pptx template.pptx --excel names.xlsx --placeholder "[الاسم]" --has-header
```

## ملاحظات

- يحافظ على تنسيق النص (الخط، الحجم، اللون) لأنه يستبدل داخل نفس مربّع النص.
- يدعم استبدال المكان المحجوز داخل مربّعات النص وداخل الجداول.
- في الوضع الافتراضي يُستخدم القالب المكوّن من شريحة واحدة؛ إن احتوى القالب على شرائح
  إضافية فإنها تبقى، وتُضاف شرائح الأسماء في نهاية الملف.
