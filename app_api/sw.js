// Service Worker (PWA)
const CACHE_NAME = 'antigravity-chat-v6'; // バージョンアップでキャッシュを強制リセット
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

self.addEventListener('install', event => {
    self.skipWaiting(); // 新しいSWをすぐにアクティブにする
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); // すべてのクライアントを直ちに新しいSWの制御下に置く
});

self.addEventListener('fetch', event => {
    // ネットワークファースト (Network First) 戦略
    // 常に最新のファイルを取りに行き、スマホでも更新が即座に反映されるようにする
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // ネットワーク取得成功時：今後のオフライン用にキャッシュを更新して返す
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // オフライン時やエラー時はキャッシュから返す
                return caches.match(event.request);
            })
    );
});
