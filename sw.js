// Service Worker لتشغيل محفظتي الذكية كـ تطبيق موبايل أوفلاين مع التحديث التلقائي اللحظي
const CACHE_NAME = 'smart-wallet-cache-v7';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './style.css?v=3.5',
  './css/style.css?v=3.5',
  './js/app.js?v=3.2',
  './js/charts.js?v=3.2',
  './js/sync.js?v=3.2',
  './libs/chart.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// تثبيت ملفات الكاش والتخطي الفوري للانتظار
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
        } catch (e) {
          // تجاوز أي ملف اختياري غير موجود بدون إيقاف التثبيت
        }
      }
    })
  );
});

// تفعيل وتنظيف الكاش القديم فوراً للسيطرة على الصفحات
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('حذف كاش قديم:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// إستراتيجية Network-First: جلب أحدث نسخة طالما الجهاز متصل، مع الرجوع للكاش أوفلاين
self.addEventListener('fetch', (event) => {
  // للطلبات الخارجية (مثل مكتبات جوجل وسحابة Firebase) نتركها للمتصفح مباشرة
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // تحديث الكاش بالنسخة الأحدث التي تم جلبها من السيرفر
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // إذا كان الموبايل أوفلاين أو انقطع السيرفر، يتم جلب الملفات من الكاش فوراً
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
