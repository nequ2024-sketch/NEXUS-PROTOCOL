# NEXUS PROTOCOL

منصة DApp غير حاضنة على BSC. يبدأ هذا المشروع حصرياً على **BSC Testnet (Chain ID 97)**. لا توجد إعدادات نشر على Mainnet. شاشة Terminal تقرأ بيانات سوق Binance Spot العامة فقط؛ إرسال أوامر التداول مقفل افتراضياً.

## متطلبات التشغيل

- Node.js 20 أو أحدث و pnpm
- محفظة متصفح مثل MetaMask عند اختبار الواجهة
- إعدادات Testnet صالحة عند النشر فقط

## تثبيت وفحص العقود

```bash
pnpm install
pnpm --filter @workspace/nexus-protocol run compile:contracts
pnpm --filter @workspace/nexus-protocol run test:contracts
pnpm --filter @workspace/nexus-protocol run test:backend
pnpm --filter @workspace/nexus-protocol run typecheck
```

## واجهة السوق وخادم API

- افتح `/terminal` لمخطط شموع ودفتر أوامر حيّين من Binance Spot العام. اختيار السوق أو عرض الشموع لا يرسل أي أمر تداول.
- صفقات المحفظة وسجل الأداء وإشارات NEXUS تبقى فارغة/غير متاحة إلى أن تتوفر مصادرها المنشورة؛ لا توجد قيم تجريبية معروضة على أنها حقيقية.
- خادم Flask يعمل على خدمة `/nexus-api`; واجهاته تشمل صحة الخدمة، تسجيل دخول محفظة بتوقيع nonce، حالة المحفظة، حجوزات Telegram، التحقق من معاملات BSC Testnet، الإشارات، المراكز، السجل والأداء.
- SQLite محلي لتخزين الجلسات والمعاملات والحجوزات. لا تضع بيانات اعتماد في قاعدة البيانات أو ملفات المصدر.
- إعدادات التداول الافتراضية `ENABLE_TESTNET_TRADING=false` و`BINANCE_TESTNET=false`. بيانات اعتماد Binance الاختبارية تُقرأ من بيئة التشغيل فقط، ولا يعرض هذا الإصدار أزرار إرسال أوامر فعالة.

## نشر Testnet

1. أضف القيم اللازمة إلى Replit Secrets، وليس إلى ملف متعقب:
   - `PRIVATE_KEY` لمحفظة اختبار جديدة لا تحتوي أموالاً حقيقية
   - `TREASURY_ADDRESS` و `PUBLISHER_ADDRESS` (إن لم يُضبطا، تستخدم المحفظة الناشرة عنوان deployer على Testnet)
   - اختر واحداً فقط: `BSC_TESTNET_PAYMENT_TOKEN_ADDRESS` لرمز اختبار موجود بدقة 18 منزلة، أو `DEPLOY_TEST_MOCK_PAYMENT_TOKEN=true` لنشر mUSDT تجريبي بلا قيمة حقيقية.
   - `NEXUS_PER_USDT`, `PRESALE_MIN_PURCHASE_USDT`, `PRESALE_START_TIMESTAMP`, `PRESALE_DURATION_DAYS`
   - `PRESALE_HARD_CAP_NEXUS` (لا يتجاوز 300 مليون)
2. راجع إعدادات العقد وعناوين الرموز التجريبية، وتأكد من امتلاك المحفظة ما يكفي من BNB تجريبي للغاز.
3. شغّل `pnpm --filter @workspace/nexus-protocol run deploy:testnet`.
4. عند توفر `BSCSCAN_KEY`، شغّل `pnpm --filter @workspace/nexus-protocol run verify:testnet`.

السكريبت يرفض أي شبكة غير BSC Testnet، ويتطلب اختيار رمز دفع وقيم بيع صريحة. إذا كانت `PRESALE_START_TIMESTAMP=now` يبدأ البيع عند النشر؛ وإلا يجب أن يكون الطابع الزمني مستقبلياً. لا ينشر إلى Mainnet ولا يختار تلقائياً عقد USDT على Testnet. ينشئ خطتي الاشتراك المحددتين في المواصفات: 49 من رمز الدفع شهرياً و499 سنوياً، ويحوّل 300 مليون NEXUS إلى عقد البيع. بعد النشر يحفظ عناوين العقود العامة في سجل النشر وملف الواجهة.

## وحدات العقود

- `NexusToken.sol`: عرض ثابت، مع رسوم حرق وخزينة اختيارية لا تتجاوز كل منها 5%.
- `Presale.sol`: يبيع NEXUS مقابل رمز دفع ERC-20 مُعطى صراحة، باستخدام 18 منزلة عشرية.
- `SignalRegistry.sol`: يسجل بصمة الإشارة وينسب النشر والتنفيذ إلى الناشر المخول.
- `SubscriptionManager.sol`: خطط USDT، وإلغاء التجديد مع إبقاء الوصول حتى الانتهاء، وتجديد فترات التأخر عبر keeper مصرح.

## ملاحظات أمان وتشغيل

- إشارات التداول ونتائجها المنشورة من الناشر بيانات يصرح بها الناشر؛ لا تثبت وحدها تنفيذ الصفقة في Binance.
- لا تستخدم مفاتيح محفظتك الشخصية أو مفاتيح إنتاج Binance في الاختبار. لخادم JWT استخدم Replit Secret `SESSION_SECRET` أو `SECRET_KEY` بطول لا يقل عن 32 بايت.
- واجهة Binance في المتصفح لا تطلب مفاتيح. لا تفعّل تداول Testnet إلا بعد إضافة مفاتيح Binance Testnet كأسرار، وضبط `BINANCE_TESTNET=true` و`ENABLE_TESTNET_TRADING=true` صراحةً. هذا الإصدار لا يفعّل التداول الآلي.
- لا تعتبر نتائج نموذج الذكاء الاصطناعي توصية استثمارية أو ضماناً للأداء.
- قبل أي Mainnet يلزم تدقيق مستقل للعقود، ومراجعة سياسة الرسوم، واختبار شامل، وموافقة صريحة منفصلة. إعداد Mainnet غير موجود عمداً في هذا المشروع.
