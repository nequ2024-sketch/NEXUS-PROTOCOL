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
- خادم Flask يعمل على خدمة `/nexus-api`. تسجيل دخول المحفظة يصدر جلسة في Cookie من نوع `HttpOnly`؛ لا يخزن المتصفح JWT في `localStorage`. الوصول المدفوع يتحقق من حالة العقد مباشرة على BSC Testnet.
- الخطط: FREE بلا مزايا مدفوعة؛ STARTER للإشارات؛ PRO للإشارات وواجهات البوت؛ ENTERPRISE لكل المزايا وواجهة `/api/v1/signals`. الأسعار: 49 USDT أو 3,920 NEXUS لـ30 يوماً؛ 199 USDT أو 15,920 NEXUS لـ30 يوماً؛ Enterprise بسعر إجمالي 999 USDT أو 79,920 NEXUS لمدة 365 يوماً. سعر التحويل داخل العقد ثابت عند 80 NEXUS لكل 1 USDT.
- التحقق من دفعة الاشتراك يطلب إيصال BSC Testnet من BscScan، ويتأكد من سجل الحدث والعقد والمرسل، ويرفض إعادة استعمال `tx_hash`. أي تداول أو تنفيذ بوت يبقى بحاجة إلى تأكيد منفصل من المستخدم.
- SQLite محلي لتخزين الجلسات والمعاملات والحجوزات. لا تضع بيانات اعتماد في قاعدة البيانات أو ملفات المصدر.
- إعدادات التداول الافتراضية `ENABLE_TESTNET_TRADING=false` و`BINANCE_TESTNET=false`. بيانات اعتماد Binance الاختبارية تُقرأ من بيئة التشغيل فقط، ولا يعرض هذا الإصدار أزرار إرسال أوامر فعالة.

## نشر Testnet

1. أضف القيم اللازمة إلى Replit Secrets، وليس إلى ملف متعقب:
    - `PRIVATE_KEY` لمحفظة نشر جديدة على Testnet فقط، لا تحتوي أموالاً حقيقية.
    - `BSCSCAN_KEY` لمفتاح BscScan Testnet.
    - `SUBSCRIPTION_KEEPER_PRIVATE_KEY` لمحفظة Keeper مستقلة مخصصة لـTestnet، ويجب تمويلها بـBNB تجريبي للغاز.
   - `TREASURY_ADDRESS` و `PUBLISHER_ADDRESS` (إن لم يُضبطا، تستخدم المحفظة الناشرة عنوان deployer على Testnet)
   - اختر واحداً فقط: `BSC_TESTNET_PAYMENT_TOKEN_ADDRESS` لرمز اختبار موجود بدقة 18 منزلة، أو `DEPLOY_TEST_MOCK_PAYMENT_TOKEN=true` لنشر mUSDT تجريبي بلا قيمة حقيقية.
   - `NEXUS_PER_USDT`, `PRESALE_MIN_PURCHASE_USDT`, `PRESALE_START_TIMESTAMP`, `PRESALE_DURATION_DAYS`
    - `PRESALE_HARD_CAP_NEXUS` (لا يتجاوز 300 مليون)
    - `SUBSCRIPTION_KEEPER_ADDRESS` اختياري؛ عند ضبط مفتاح Keeper يُستنتج عنوانه ويُصرّح له تلقائياً، مع رفض عدم التطابق إذا ضُبط العنوان يدوياً.
2. راجع إعدادات العقد وعناوين الرموز التجريبية، وتأكد من امتلاك المحفظة ما يكفي من BNB تجريبي للغاز.
3. شغّل `pnpm --filter @workspace/nexus-protocol run deploy:testnet`.
4. حدّث سجل النشر وعنوان العقد في بيئة الخادم كـ`SUBSCRIPTION_MANAGER_ADDRESS`. عند توفر `BSCSCAN_KEY`، شغّل `pnpm --filter @workspace/nexus-protocol run verify:testnet`.
5. استخدم `BSCSCAN_KEY` للتحقق من عمليات الشراء والتحقق من مصادر العقود. يظل عامل التجديد معطلاً افتراضياً؛ فعّله بـ`SUBSCRIPTION_KEEPER_ENABLED=true` فقط بعد اختبار العقد على Testnet. يتوقف التجديد إذا لم تكن موافقة/رصيد المستخدم كافيين أو إذا تعذر اتصال RPC.

السكريبت يرفض أي شبكة غير BSC Testnet، ويتطلب اختيار رمز دفع وقيم Presale صريحة، ويتأكد من أن رمز الدفع يستخدم 18 منزلة عشرية. إذا كانت `PRESALE_START_TIMESTAMP=now` يبدأ البيع عند النشر؛ وإلا يجب أن يكون الطابع الزمني مستقبلياً. لا ينشر إلى Mainnet ولا يختار تلقائياً عقد USDT على Testnet. ينشئ خطط الاشتراك FREE وSTARTER وPRO وENTERPRISE بالقيم أعلاه، ويحوّل 300 مليون NEXUS إلى عقد البيع. بعد النشر يحفظ عناوين العقود العامة في سجل النشر وملف الواجهة.

## وحدات العقود

- `NexusToken.sol`: عرض ثابت، مع رسوم حرق وخزينة اختيارية لا تتجاوز كل منها 5%.
- `Presale.sol`: يبيع NEXUS مقابل رمز دفع ERC-20 مُعطى صراحة، باستخدام 18 منزلة عشرية.
- `SignalRegistry.sol`: يسجل بصمة الإشارة وينسب النشر والتنفيذ إلى الناشر المخول.
- `SubscriptionManager.sol`: خطط تدفع برمز Testnet المحدد أو NEXUS، تجديد اختياري بعد موافقة صريحة allowance + معاملة تفعيل منفصلة، وإلغاء التجديد مع إبقاء الوصول حتى الانتهاء. الترقية تحافظ على تاريخ الانتهاء، وتحصّل الأكبر من فرق السعر النسبي أو 25% من السعر الكامل للخطة الجديدة؛ ويُعاد إيقاف التجديد التلقائي بعد الترقية.

## ملاحظات أمان وتشغيل

- إشارات التداول ونتائجها المنشورة من الناشر بيانات يصرح بها الناشر؛ لا تثبت وحدها تنفيذ الصفقة في Binance.
- لا تستخدم مفاتيح محفظتك الشخصية أو مفاتيح إنتاج Binance في الاختبار. لخادم JWT استخدم Replit Secret `SESSION_SECRET` أو `SECRET_KEY` بطول لا يقل عن 32 بايت.
- API الاشتراكات والتحقق والتجديد غير مفعّلة فعلياً حتى نشر العقود على Testnet وضبط العناوين والأسرار اللازمة. عنوان NEXUS Mainnet المذكور في الطلب لم يُستخدم ولم يُتحقق منه.
- واجهة Binance في المتصفح لا تطلب مفاتيح. لا تفعّل تداول Testnet إلا بعد إضافة مفاتيح Binance Testnet كأسرار، وضبط `BINANCE_TESTNET=true` و`ENABLE_TESTNET_TRADING=true` صراحةً. هذا الإصدار لا يفعّل التداول الآلي.
- لا تعتبر نتائج نموذج الذكاء الاصطناعي توصية استثمارية أو ضماناً للأداء.
- قبل أي Mainnet يلزم تدقيق مستقل للعقود، ومراجعة سياسة الرسوم، واختبار شامل، وموافقة صريحة منفصلة. إعداد Mainnet غير موجود عمداً في هذا المشروع.
