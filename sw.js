// 門人夥伴管理系統 - 最簡單的 Service Worker
// 目的只是讓手機瀏覽器判定這個網頁「可以加入主畫面、可以像 App 一樣全螢幕開啟」。
// 這裡刻意不快取任何資料，確保每次打開都是 Google Sheet 上最新的資料，不會看到舊資料。

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 直接照原樣去網路拿資料，不做任何快取
  event.respondWith(fetch(event.request));
});
