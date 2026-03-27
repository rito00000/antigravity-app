/**
 * Antigravity Chat App - app.js
 * 全面レビュー・修正版 v3 (IndexedDB対応)
 */

// ============================================================
// 1. STATE MANAGEMENT
// ============================================================
const AppState = {
    apiKey: '',
    model: 'gemini-3.1-flash-lite-preview',
    roomModel: 'gemini-3.1-flash-lite-preview',
    characters: [], // { id, name, prompt, appearance, roomSettings, roomState, roomLogs, diary, roomLongTermMemory }
    threads: [],    // { id, charId, title, createdAt, messages: [] }
    memories: [],   // { id, charId, createdAt, content }
    activeCharId: null,
    activeThreadId: null
};

// ============================================================
// 2. INDEXED-DB STORAGE
// ============================================================
const DB_NAME = 'antigravity_chat';
const DB_VERSION = 1;
const STORE_APP = 'appData';
const STORE_IMAGES = 'roomImages';
let _db = null;

/** IndexedDBを開く（初回はストア作成） */
function openDB() {
    return new Promise((resolve, reject) => {
        if (_db) return resolve(_db);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_APP)) {
                db.createObjectStore(STORE_APP);
            }
            if (!db.objectStoreNames.contains(STORE_IMAGES)) {
                db.createObjectStore(STORE_IMAGES);
            }
        };
        req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
        req.onerror = (e) => { console.error('IndexedDB open error:', e); reject(e); };
    });
}

/** IndexedDBからデータを読み込む */
async function loadData() {
    try {
        const db = await openDB();
        const data = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_APP, 'readonly');
            const store = tx.objectStore(STORE_APP);
            const req = store.get('main');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        if (data) {
            AppState.apiKey = data.apiKey || '';
            AppState.model = data.model || 'gemini-3.1-flash-lite-preview';
            AppState.roomModel = data.roomModel || 'gemini-3.1-flash-lite-preview';
            AppState.characters = Array.isArray(data.characters) ? data.characters : [];
            AppState.threads = Array.isArray(data.threads) ? data.threads : [];
            AppState.memories = Array.isArray(data.memories) ? data.memories : [];
            console.log('[DB] IndexedDBからデータ読込完了');
            return;
        }
        // IndexedDBにデータが無い場合、localStorageからマイグレーション
        const raw = localStorage.getItem('chatApp_data');
        if (raw) {
            const parsed = JSON.parse(raw);
            AppState.apiKey = parsed.apiKey || '';
            AppState.model = parsed.model || 'gemini-3.1-flash-lite-preview';
            AppState.roomModel = parsed.roomModel || 'gemini-3.1-flash-lite-preview';
            AppState.characters = Array.isArray(parsed.characters) ? parsed.characters : [];
            AppState.threads = Array.isArray(parsed.threads) ? parsed.threads : [];
            AppState.memories = Array.isArray(parsed.memories) ? parsed.memories : [];
            await saveData(); // IndexedDBに移行保存
            console.log('[DB] localStorageからIndexedDBへマイグレーション完了');
        }
    } catch (e) {
        console.error('データの読み込みに失敗しました:', e);
        // フォールバック: localStorageから読み込み
        try {
            const raw = localStorage.getItem('chatApp_data');
            if (raw) {
                const parsed = JSON.parse(raw);
                AppState.apiKey = parsed.apiKey || '';
                AppState.model = parsed.model || 'gemini-3.1-flash-lite-preview';
                AppState.roomModel = parsed.roomModel || 'gemini-3.1-flash-lite-preview';
                AppState.characters = Array.isArray(parsed.characters) ? parsed.characters : [];
                AppState.threads = Array.isArray(parsed.threads) ? parsed.threads : [];
                AppState.memories = Array.isArray(parsed.memories) ? parsed.memories : [];
                console.log('[DB] フォールバック: localStorageからデータ読込');
            }
        } catch (e2) { console.error('localStorageフォールバックも失敗:', e2); }
    }
}

/** IndexedDBにデータを保存する */
async function saveData() {
    try {
        const db = await openDB();
        const dataToSave = {
            apiKey: AppState.apiKey,
            model: AppState.model,
            roomModel: AppState.roomModel,
            characters: AppState.characters,
            threads: AppState.threads,
            memories: AppState.memories
        };
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_APP, 'readwrite');
            const store = tx.objectStore(STORE_APP);
            const req = store.put(dataToSave, 'main');
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.error('データの保存に失敗しました:', e);
        alert('データの保存に失敗しました。ストレージ容量をご確認ください。');
    }
}

/** 画像BlobをIndexedDBに保存 (key: "charId_imageType") */
async function saveImageToDB(key, blob) {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readwrite');
            const store = tx.objectStore(STORE_IMAGES);
            const req = store.put(blob, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) { console.error('[DB] 画像保存失敗:', key, e); }
}

/** 画像BlobをIndexedDBから取得→ObjectURL生成 */
async function loadImageFromDB(key) {
    try {
        const db = await openDB();
        const blob = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readonly');
            const store = tx.objectStore(STORE_IMAGES);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        if (blob) return URL.createObjectURL(blob);
        return null;
    } catch (e) { console.error('[DB] 画像読込失敗:', key, e); return null; }
}

/** 画像BlobをIndexedDBから削除 */
async function deleteImageFromDB(key) {
    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readwrite');
            const store = tx.objectStore(STORE_IMAGES);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (e) { console.error('[DB] 画像削除失敗:', key, e); }
}

/** ストレージ永続化リクエスト */
async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        const granted = await navigator.storage.persist();
        console.log('[DB] ストレージ永続化:', granted ? '許可' : '拒否');
    }
}

// ============================================================
// 3. UTILITIES
// ============================================================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 日付フォーマット (yyyy/MM/dd HH:mm)
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}/${month}/${day} ${hh}:${mm}`;
}

/**
 * XSSを防ぐHTMLエスケープ関数
 */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// 3.5. DEVICE CONTEXT UTILITIES
// ============================================================

/**
 * 端末情報の取り扱い指示のデフォルト文言
 */
const DEFAULT_CONTEXT_INSTRUCTION = `以下の【ユーザー端末情報】は、ユーザーの現在の環境・状況を示す裏側のメタデータです。
あなたはこの情報を会話の背景として常に把握してください。
ただし、毎回の返答で必ず言及する必要はありません。
「深夜だから体調を気遣う」「充電が少ないから手短に返す」など、キャラクターとして自然に触れるべきタイミングでのみ、会話にさりげなく織り交ぜてください。
特に触れる必要がない場合は、この情報について一切言及しないでください。`;

/**
 * 新規キャラクター用のデフォルトコンテキスト設定を返す
 */
function getDefaultContextSettings() {
    return {
        sendDatetime: true,
        sendDevice: true,
        sendOs: true,
        sendNetwork: true,
        sendBattery: true,
        contextInstruction: DEFAULT_CONTEXT_INSTRUCTION
    };
}

/**
 * 現在日時の文字列を返す
 */
function getDatetimeString() {
    try {
        const now = new Date();
        const yyyy = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
        const dow = weekdays[now.getDay()];

        let period = '';
        const hour = now.getHours();
        if (hour >= 5 && hour < 10) period = '朝';
        else if (hour >= 10 && hour < 12) period = '午前';
        else if (hour >= 12 && hour < 14) period = '昼';
        else if (hour >= 14 && hour < 17) period = '午後';
        else if (hour >= 17 && hour < 20) period = '夕方';
        else if (hour >= 20 && hour < 24) period = '夜';
        else period = '深夜';

        return `${yyyy}/${month}/${day}(${dow}) ${hh}:${mm} (${period})`;
    } catch (e) {
        return null;
    }
}

/**
 * デバイス種別(Mobile/Desktop)を返す
 */
function getDeviceType() {
    try {
        const ua = navigator.userAgent || '';
        const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        return isMobile ? 'Mobile（モバイル端末）' : 'Desktop（PC）';
    } catch (e) {
        return null;
    }
}

/**
 * OS種別を返す
 */
function getOsType() {
    try {
        const ua = navigator.userAgent || '';
        if (/Android/i.test(ua)) return 'Android';
        if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
        if (/Windows/i.test(ua)) return 'Windows';
        if (/Mac OS/i.test(ua)) return 'macOS';
        if (/Linux/i.test(ua)) return 'Linux';
        if (/CrOS/i.test(ua)) return 'ChromeOS';
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * ネットワーク状況を取得して室内/屋外を判定する
 */
function getNetworkInfo() {
    try {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn || !conn.type) return null;
        const type = conn.type;
        if (type === 'wifi' || type === 'ethernet') {
            return 'Wi-Fi接続（おそらく室内）';
        } else if (type === 'cellular') {
            const eff = conn.effectiveType || '';
            return `モバイル回線(${eff.toUpperCase()})接続（おそらく屋外）`;
        } else if (type === 'none') {
            return 'オフライン';
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * バッテリー状況を取得する（非同期）
 */
async function getBatteryInfo() {
    try {
        if (!navigator.getBattery) return null;
        const battery = await navigator.getBattery();
        const level = Math.round(battery.level * 100);
        const charging = battery.charging ? '充電中' : '放電中（バッテリー駆動）';
        return `${level}% (${charging})`;
    } catch (e) {
        return null;
    }
}

/**
 * 設定に基づいてコンテキスト文字列を組み立てる（非同期）
 * @param {object} contextSettings - キャラクターのコンテキスト設定
 * @returns {Promise<string|null>} - AIに付与する文字列（全てOFFまたは取得不可なら null）
 */
async function buildContextString(contextSettings) {
    if (!contextSettings) return null;

    const lines = [];

    if (contextSettings.sendDatetime) {
        const dt = getDatetimeString();
        if (dt) lines.push(`現在日時: ${dt}`);
    }
    if (contextSettings.sendDevice) {
        const dev = getDeviceType();
        if (dev) lines.push(`デバイス: ${dev}`);
    }
    if (contextSettings.sendOs) {
        const os = getOsType();
        if (os) lines.push(`OS: ${os}`);
    }
    if (contextSettings.sendNetwork) {
        const net = getNetworkInfo();
        if (net) lines.push(`ネットワーク: ${net}`);
    }
    if (contextSettings.sendBattery) {
        const bat = await getBatteryInfo();
        if (bat) lines.push(`バッテリー: ${bat}`);
    }

    if (lines.length === 0) return null;

    const instruction = (contextSettings.contextInstruction || '').trim();
    let result = '';
    if (instruction) {
        result += instruction + '\n\n';
    }
    result += '【ユーザー端末情報】\n';
    result += lines.join('\n');

    return result;
}

// ============================================================
// 4. VIEW NAVIGATION
// ============================================================
const views = {
    main: document.getElementById('main-view'),
    thread: document.getElementById('thread-view'),
    chat: document.getElementById('chat-view'),
    charSettings: document.getElementById('char-settings-view'),
    charMemory: document.getElementById('char-memory-view'),
    contextSettings: document.getElementById('context-settings-view'),
    globalSettings: document.getElementById('global-settings-view'),
    room: document.getElementById('room-view'),
    roomDiary: document.getElementById('room-diary-view'),
    roomSchedule: document.getElementById('room-schedule-view'),
    roomItems: document.getElementById('room-items-view'),
    roomLogs: document.getElementById('room-logs-view'),
    roomSettings: document.getElementById('room-settings-view')
};

function showView(viewName, pushHistory = true) {
    if (!views[viewName]) {
        console.error('不明なビュー名:', viewName);
        return;
    }

    // デバッグログ
    console.log(`[Router] View transition: ${viewName} (push: ${pushHistory})`);

    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');

    // 履歴を積む
    if (pushHistory) {
        const state = {
            view: viewName,
            charId: AppState.activeCharId,
            threadId: AppState.activeThreadId
        };
        const hash = '#' + viewName;
        // 現在のURLが既に同じハッシュなら pushState しない（重複防止）
        if (location.hash !== hash) {
            history.pushState(state, '', hash);
        } else {
            history.replaceState(state, '', hash);
        }
    }

    // Background control for thread and chat views
    if (viewName === 'thread' || viewName === 'chat') {
        setTimeout(() => {
            if (typeof updateGlobalBackground === 'function') {
                updateGlobalBackground(AppState.activeCharId);
            }
        }, 0);
    } else {
        if (typeof updateGlobalBackground === 'function') {
            updateGlobalBackground(null);
        }
    }
}

// --- SPA Routing (popstate) ---
window.addEventListener('popstate', (e) => {
    const state = e.state;

    // デバッグログ
    console.log('[Router] PopState detected', state);

    if (state && state.view) {
        // 状態の復元
        AppState.activeCharId = state.charId || null;
        AppState.activeThreadId = state.threadId || null;

        // 画面の再表示（履歴は積まない）
        showView(state.view, false);

        // 各画面に応じた再描画が必要な場合
        if (state.view === 'main') renderCharacters();
        if (state.view === 'thread') renderThreads();
        if (state.view === 'chat') renderChat(true);
        if (state.view === 'charMemory') renderMemories();
        if (state.view === 'room') {
            const char = AppState.characters.find(c => c.id === AppState.activeCharId);
            if (char) updateRoomVisuals(char);
        }
    } else {
        // 履歴の底に到達した場合
        // メイン画面を表示
        showView('main', false);
        renderCharacters();
    }
});

// ============================================================
// 5. RENDER FUNCTIONS
// ============================================================

/**
 * キャラクター一覧の描画
 */
function renderCharacters() {
    const list = document.getElementById('character-list');
    list.innerHTML = '';
    AppState.characters.forEach(char => {
        const threadCount = AppState.threads.filter(t => t.charId === char.id).length;

        const li = document.createElement('li');
        li.className = 'list-item';

        const content = document.createElement('div');
        content.className = 'list-item-content';

        const title = document.createElement('span');
        title.className = 'list-item-title';
        title.textContent = `📁 ${char.name}`;

        const sub = document.createElement('span');
        sub.className = 'list-item-sub';
        sub.textContent = `スレッド数: ${threadCount}`;

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete-item';
        delBtn.textContent = '🗑️';
        delBtn.setAttribute('aria-label', `${char.name}を削除`);
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteCharacter(char.id);
        };

        content.appendChild(title);
        content.appendChild(sub);
        li.appendChild(content);
        li.appendChild(delBtn);

        li.onclick = (e) => {
            if (e.target.closest('.btn-delete-item')) return;
            AppState.activeCharId = char.id;
            AppState.activeThreadId = null;
            document.getElementById('thread-header-title').textContent = char.name;
            renderThreads();
            showView('thread');
        };

        list.appendChild(li);
    });
}

/**
 * スレッド一覧の描画
 */
function renderThreads() {
    const list = document.getElementById('thread-list');
    list.innerHTML = '';

    const charThreads = AppState.threads
        .filter(t => t.charId === AppState.activeCharId)
        .slice()
        .reverse();

    charThreads.forEach(t => {
        const li = document.createElement('li');
        li.className = 'list-item';

        const content = document.createElement('div');
        content.className = 'list-item-content';

        const title = document.createElement('span');
        title.className = 'list-item-title';
        title.textContent = `💬 ${t.title}`;

        const sub = document.createElement('span');
        sub.className = 'list-item-sub';
        const msgCount = Array.isArray(t.messages) ? t.messages.length : 0;
        sub.textContent = `${formatDate(t.createdAt)} / ${msgCount} messages`;

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete-item';
        delBtn.textContent = '🗑️';
        delBtn.setAttribute('aria-label', `スレッド「${t.title}」を削除`);
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteThread(t.id);
        };

        content.appendChild(title);
        content.appendChild(sub);
        li.appendChild(content);
        li.appendChild(delBtn);

        li.onclick = (e) => {
            if (e.target.closest('.btn-delete-item')) return;
            AppState.activeThreadId = t.id;
            document.getElementById('chat-header-title').textContent = t.title;
            renderChat(true);
            showView('chat');
        };

        list.appendChild(li);
    });
}

/**
 * チャット画面の描画
 */
function renderChat(shouldScroll = false) {
    const historyDiv = document.getElementById('chat-history');
    historyDiv.innerHTML = '';

    const thread = AppState.threads.find(t => t.id === AppState.activeThreadId);
    if (!thread || !Array.isArray(thread.messages)) return;

    thread.messages.forEach(m => {
        const div = document.createElement('div');
        div.className = `message-card ${m.role === 'user' ? 'msg-user' : 'msg-ai'}`;

        const textEl = document.createElement('div');
        textEl.className = 'msg-text';
        textEl.textContent = m.text;

        const timeEl = document.createElement('div');
        timeEl.className = 'msg-time';
        let metaText = formatDate(m.timestamp);
        if (m.role === 'model' && m.modelUsed) {
            metaText += ` (${m.modelUsed})`;
        }
        timeEl.textContent = metaText;

        div.appendChild(textEl);
        div.appendChild(timeEl);
        historyDiv.appendChild(div);
    });

    if (shouldScroll) {
        requestAnimationFrame(() => {
            historyDiv.scrollTop = historyDiv.scrollHeight;
        });
    }
}

/**
 * メモリ一覧の描画
 */
function renderMemories() {
    const list = document.getElementById('memory-list');
    list.innerHTML = '';
    if (!AppState.activeCharId) return;

    const charMemories = AppState.memories
        .filter(m => m.charId === AppState.activeCharId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (charMemories.length === 0) {
        const emptyMsg = document.createElement('li');
        emptyMsg.style.cssText = 'padding: 20px; text-align: center; color: var(--text-secondary); font-size: 0.9rem;';
        emptyMsg.textContent = 'まだ記憶はありません。会話を重ねると自動で記憶が蓄積されます。';
        list.appendChild(emptyMsg);
        return;
    }

    charMemories.forEach(m => {
        const li = document.createElement('li');
        li.className = 'list-item';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'list-item-content';

        const dateSpan = document.createElement('div');
        dateSpan.className = 'memory-date';
        dateSpan.textContent = formatDate(m.createdAt);

        const textSpan = document.createElement('div');
        textSpan.className = 'memory-item';
        textSpan.textContent = m.content;

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete-item';
        delBtn.textContent = '🗑️';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm('この記憶を削除しますか？')) {
                AppState.memories = AppState.memories.filter(mem => mem.id !== m.id);
                saveData();
                renderMemories();
            }
        };

        contentDiv.appendChild(dateSpan);
        contentDiv.appendChild(textSpan);
        li.appendChild(contentDiv);
        li.appendChild(delBtn);
        list.appendChild(li);
    });
}

// ============================================================
// 6. CRUD OPERATIONS
// ============================================================

function deleteCharacter(charId) {
    if (!confirm('このキャラクターと、それに紐づく全てのスレッド・メモリを削除しますか？')) return;
    AppState.characters = AppState.characters.filter(c => c.id !== charId);
    AppState.threads = AppState.threads.filter(t => t.charId !== charId);
    AppState.memories = AppState.memories.filter(m => m.charId !== charId);
    if (AppState.activeCharId === charId) AppState.activeCharId = null;
    saveData();
    renderCharacters();
}

function deleteThread(threadId) {
    if (!confirm('このスレッドを削除しますか？')) return;
    AppState.threads = AppState.threads.filter(t => t.id !== threadId);
    if (AppState.activeThreadId === threadId) AppState.activeThreadId = null;
    saveData();
    renderThreads();
    renderCharacters(); // スレッド数表示を更新
}

// ============================================================
// 7. EVENT LISTENERS
// ============================================================
function setupEventListeners() {

    // --- Navigation ---
    document.getElementById('btn-global-settings').onclick = () => showView('globalSettings');
    document.getElementById('btn-close-global-settings').onclick = () => history.back();

    document.getElementById('btn-back-to-chars').onclick = () => {
        history.back();
    };

    document.getElementById('btn-back-to-threads').onclick = () => {
        history.back();
    };

    // --- Global Background Check on Initial Load ---
    // (Ensure background reflects current char even if refreshed on chat/thread view)
    updateGlobalBackground(AppState.activeCharId);

    // --- Character Management ---
    document.getElementById('btn-add-character').onclick = () => {
        AppState.activeCharId = null;
        document.getElementById('char-name-input').value = '';
        document.getElementById('char-appearance-input').value = '';
        document.getElementById('char-prompt-input').value = '';
        document.getElementById('btn-delete-char').style.display = 'none';
        // 外見プロンプトエリアも初期化
        document.getElementById('appearance-prompt-area').style.display = 'none';
        document.getElementById('appearance-prompt-output').textContent = '';
        // 新規キャラ用：一時的なコンテキスト設定を初期化（保存時に使う）
        window._tempContextSettings = getDefaultContextSettings();
        showView('charSettings');
    };

    // --- Thread Actions (プロンプト設定 / メモリ管理) ---
    const btnPrompt = document.getElementById('btn-char-prompt-settings');
    if (btnPrompt) {
        btnPrompt.onclick = () => {
            const char = AppState.characters.find(c => c.id === AppState.activeCharId);
            if (!char) return;
            document.getElementById('char-name-input').value = char.name;
            document.getElementById('char-appearance-input').value = char.appearance || '';
            document.getElementById('char-prompt-input').value = char.prompt || '';
            document.getElementById('btn-delete-char').style.display = 'block';
            // 外見プロンプトの復元
            if (char.appearancePrompt) {
                document.getElementById('appearance-prompt-area').style.display = 'block';
                document.getElementById('appearance-prompt-output').textContent = char.appearancePrompt;
            } else {
                document.getElementById('appearance-prompt-area').style.display = 'none';
                document.getElementById('appearance-prompt-output').textContent = '';
            }
            // 既存キャラ用：一時的なコンテキスト設定を復元
            window._tempContextSettings = char.contextSettings
                ? JSON.parse(JSON.stringify(char.contextSettings))
                : getDefaultContextSettings();
            showView('charSettings');
        };
    }

    const btnMemory = document.getElementById('btn-char-memory-settings');
    if (btnMemory) {
        btnMemory.onclick = () => {
            if (!AppState.activeCharId) return;
            renderMemories();
            showView('charMemory');
        };
    }

    // Modal close buttons
    document.getElementById('btn-close-char-settings').onclick = () => {
        history.back();
    };

    const btnCloseMemory = document.getElementById('btn-close-char-memory');
    if (btnCloseMemory) {
        btnCloseMemory.onclick = () => history.back();
    }

    // --- Context Settings (端末情報設定画面) ---
    document.getElementById('btn-open-context-settings').onclick = () => {
        const settings = window._tempContextSettings || getDefaultContextSettings();
        document.getElementById('ctx-datetime').checked = settings.sendDatetime;
        document.getElementById('ctx-device').checked = settings.sendDevice;
        document.getElementById('ctx-os').checked = settings.sendOs;
        document.getElementById('ctx-network').checked = settings.sendNetwork;
        document.getElementById('ctx-battery').checked = settings.sendBattery;
        document.getElementById('ctx-instruction-input').value = settings.contextInstruction || DEFAULT_CONTEXT_INSTRUCTION;
        // テスト結果エリアを初期化
        document.getElementById('context-test-result').style.display = 'none';
        document.getElementById('context-test-output').textContent = '';
        showView('contextSettings');
    };

    document.getElementById('btn-close-context-settings').onclick = () => {
        history.back();
    };

    document.getElementById('btn-test-context').onclick = async () => {
        const testSettings = {
            sendDatetime: document.getElementById('ctx-datetime').checked,
            sendDevice: document.getElementById('ctx-device').checked,
            sendOs: document.getElementById('ctx-os').checked,
            sendNetwork: document.getElementById('ctx-network').checked,
            sendBattery: document.getElementById('ctx-battery').checked,
            contextInstruction: document.getElementById('ctx-instruction-input').value.trim()
        };
        const btn = document.getElementById('btn-test-context');
        btn.disabled = true;
        btn.textContent = '⏳ 取得中...';
        try {
            const resultText = await buildContextString(testSettings);
            const outputArea = document.getElementById('context-test-result');
            const outputText = document.getElementById('context-test-output');
            outputArea.style.display = 'block';
            if (resultText) {
                outputText.textContent = resultText;
            } else {
                outputText.textContent = '（送信する情報はありません。全ての項目がOFFか、取得に失敗しました。）';
            }
        } catch (e) {
            console.error('コンテキストテスト失敗:', e);
            document.getElementById('context-test-output').textContent = 'テスト中にエラーが発生しました: ' + e.message;
            document.getElementById('context-test-result').style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = '🧪 テスト（現在取得できる情報を確認）';
        }
    };

    document.getElementById('btn-save-context-settings').onclick = () => {
        window._tempContextSettings = {
            sendDatetime: document.getElementById('ctx-datetime').checked,
            sendDevice: document.getElementById('ctx-device').checked,
            sendOs: document.getElementById('ctx-os').checked,
            sendNetwork: document.getElementById('ctx-network').checked,
            sendBattery: document.getElementById('ctx-battery').checked,
            contextInstruction: document.getElementById('ctx-instruction-input').value.trim()
        };
        showView('charSettings');
    };

    // --- Global Settings ---
    document.getElementById('api-key-input').value = AppState.apiKey;
    
    const setupModelUI = (stateValue, prefix, radioName) => {
        const select = document.getElementById(`${prefix}select`);
        const input = document.getElementById(`${prefix}input`);
        const radios = document.getElementsByName(radioName);
        let found = false;
        if (select) {
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === stateValue) {
                    select.selectedIndex = i;
                    found = true;
                    break;
                }
            }
        }
        if (found) {
            if (radios[0]) radios[0].checked = true;
            if (input) input.value = '';
        } else {
            if (radios[1]) radios[1].checked = true;
            if (input) input.value = stateValue || '';
        }
        const updateUI = () => {
            const radioSel = document.querySelector(`input[name="${radioName}"]:checked`);
            if (!radioSel) return;
            const isSelect = radioSel.value === 'select';
            if (select) select.disabled = !isSelect;
            if (input) {
                input.disabled = isSelect;
                if (!isSelect) input.focus();
            }
        };
        radios.forEach(r => r.addEventListener('change', updateUI));
        updateUI();
    };
    setupModelUI(AppState.model, 'model-', 'modelType');
    setupModelUI(AppState.roomModel, 'room-model-', 'roomModelType');


    // --- Character Save ---
    document.getElementById('btn-save-char').onclick = () => {
        const name = document.getElementById('char-name-input').value.trim();
        const appearance = document.getElementById('char-appearance-input').value.trim();
        const prompt = document.getElementById('char-prompt-input').value.trim();
        let appearancePrompt = document.getElementById('appearance-prompt-output').textContent.trim();
        // エラーメッセージなどは保存しない
        if (appearancePrompt === '生成中...' || appearancePrompt.startsWith('エラー:') || appearancePrompt === '生成に失敗しました。') {
            appearancePrompt = '';
        }

        if (!name) {
            alert('キャラクター名を入力してください');
            return;
        }
        if (prompt.length > 20000) {
            alert('システムプロンプトは20,000文字以内で入力してください');
            return;
        }

        if (AppState.activeCharId) {
            const char = AppState.characters.find(c => c.id === AppState.activeCharId);
            if (char) {
                char.name = name;
                char.appearance = appearance;
                char.prompt = prompt;
                char.appearancePrompt = appearancePrompt;
                char.contextSettings = window._tempContextSettings || char.contextSettings || getDefaultContextSettings();
                document.getElementById('thread-header-title').textContent = name;
            }
            saveData();
            renderCharacters();
            showView('thread');
        } else {
            const ctxSettings = window._tempContextSettings || getDefaultContextSettings();
            const newChar = { id: generateId(), name, appearance, prompt, appearancePrompt, contextSettings: ctxSettings };
            AppState.characters.push(newChar);
            saveData();
            renderCharacters();
            showView('main');
        }
    };

    document.getElementById('btn-delete-char').onclick = () => {
        if (!AppState.activeCharId) return;
        deleteCharacter(AppState.activeCharId);
        showView('main');
    };

    // --- Appearance Prompt Generation ---
    document.getElementById('btn-generate-appearance-prompt').onclick = async () => {
        const appearanceText = document.getElementById('char-appearance-input').value.trim();
        if (!appearanceText) {
            alert('外見設定を入力してからボタンを押してください。');
            return;
        }
        if (!AppState.apiKey) {
            alert('アプリ設定からAPIキーを設定してください。');
            return;
        }

        const btn = document.getElementById('btn-generate-appearance-prompt');
        const outputArea = document.getElementById('appearance-prompt-area');
        const outputText = document.getElementById('appearance-prompt-output');

        btn.disabled = true;
        btn.textContent = '⏳ 生成中...';
        outputArea.style.display = 'block';
        outputText.textContent = '生成中...';

        try {
            const reqBody = {
                systemInstruction: {
                    parts: [{ text: 'You are a prompt engineer specializing in image generation AI prompts (e.g., Stable Diffusion, Midjourney). Convert the provided character appearance description from Japanese into a well-structured English prompt suitable for generating character art. Output ONLY the English prompt text itself, nothing else. Use comma-separated tags/descriptors.' }]
                },
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: appearanceText }]
                    }
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 512
                }
            };
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${AppState.apiKey}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody)
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData?.error?.message || `HTTPエラー: ${response.status}`);
            }
            const data = await response.json();
            const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            outputText.textContent = result || '生成に失敗しました。';
        } catch (e) {
            console.error('外見プロンプト生成失敗:', e);
            outputText.textContent = 'エラー: ' + e.message;
        } finally {
            btn.disabled = false;
            btn.textContent = '✨ 英語プロンプトを生成';
        }
    };

    // --- Copy Appearance Prompt ---
    document.getElementById('btn-copy-appearance-prompt').onclick = () => {
        const text = document.getElementById('appearance-prompt-output').textContent;
        if (!text || text === '生成中...') return;
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('btn-copy-appearance-prompt');
            btn.textContent = '✅';
            setTimeout(() => { btn.textContent = '📋'; }, 1500);
        }).catch(err => {
            console.error('コピー失敗:', err);
            alert('コピーに失敗しました。');
        });
    };

    // --- Thread Management ---
    document.getElementById('btn-new-thread').onclick = () => {
        if (!AppState.activeCharId) return;
        const newThread = {
            id: generateId(),
            charId: AppState.activeCharId,
            title: '新しい会話',
            createdAt: new Date().toISOString(),
            messages: []
        };
        AppState.threads.push(newThread);
        saveData();
        AppState.activeThreadId = newThread.id;
        document.getElementById('chat-header-title').textContent = newThread.title;
        renderChat(true);
        renderCharacters(); // [バグ修正] スレッド作成時にキャラ一覧のスレッド数を更新
        showView('chat');
    };

    // --- Chat ---
    document.getElementById('btn-send').onclick = handleSendMessage;
    document.getElementById('btn-export-chat').onclick = exportCurrentThread;

    // --- Room ---
    document.getElementById('btn-open-room').onclick = () => {
        if (!AppState.activeCharId) return;
        enterRoom(AppState.activeCharId);
    };
    document.getElementById('btn-back-from-room').onclick = () => {
        history.back();
    };
    document.getElementById('btn-room-send').onclick = handleRoomReply;
    document.getElementById('room-reply-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleRoomReply();
        }
    });
    // Room Nav buttons
    document.getElementById('btn-room-diary').onclick = () => { renderRoomDiary(); showView('roomDiary'); };
    document.getElementById('btn-room-schedule').onclick = () => { renderRoomSchedule(); showView('roomSchedule'); };
    document.getElementById('btn-room-items').onclick = () => { renderRoomItems(); showView('roomItems'); };
    document.getElementById('btn-room-logs').onclick = () => { renderRoomLogs(); showView('roomLogs'); };
    document.getElementById('btn-room-settings').onclick = () => { loadRoomSettingsForm(); showView('roomSettings'); };
    // Room Modal close buttons
    document.getElementById('btn-close-room-diary').onclick = () => history.back();
    document.getElementById('btn-close-room-schedule').onclick = () => history.back();
    document.getElementById('btn-close-room-items').onclick = () => history.back();
    document.getElementById('btn-close-room-logs').onclick = () => history.back();
    document.getElementById('btn-close-room-settings-modal').onclick = () => history.back();
    // Room Settings save
    document.getElementById('btn-save-room-settings').onclick = saveRoomSettingsForm;
    // Room Gift
    document.getElementById('btn-room-gift').onclick = handleRoomGift;
    // Room Settings Cropper Events (初期化)
    setupRoomSettingsEvents();

    // --- Full Data Export/Import (Event Delegation) ---
    const globalSettingsView = document.getElementById('global-settings-view');
    if (globalSettingsView) {
        globalSettingsView.onclick = (e) => {
            const target = e.target;
            if (target.id === 'btn-export-all') {
                exportAllThreadsZip();
            } else if (target.id === 'btn-export-full') {
                exportAllDataZip();
            } else if (target.id === 'btn-import-full') {
                const inputImportFull = document.getElementById('input-import-full');
                if (inputImportFull) {
                    inputImportFull.value = '';
                    inputImportFull.click();
                }
            } else if (target.id === 'btn-save-global') {
                // --- 保存処理 ---
                AppState.apiKey = document.getElementById('api-key-input').value.trim();
                const getModelVal = (prefix, radioName) => {
                    const radioSel = document.querySelector(`input[name="${radioName}"]:checked`);
                    if (!radioSel) return '';
                    const isSelect = radioSel.value === 'select';
                    return isSelect ? document.getElementById(`${prefix}select`).value : document.getElementById(`${prefix}input`).value.trim();
                };
                const mVal = getModelVal('model-', 'modelType');
                if (mVal) AppState.model = mVal;
                const rVal = getModelVal('room-model-', 'roomModelType');
                if (rVal) AppState.roomModel = rVal;
                
                saveData();
                showView('main');
            } else if (target.id === 'btn-close-global-settings') {
                history.back();
            }
        };
    }

    const inputImportFull = document.getElementById('input-import-full');
    if (inputImportFull) {
        inputImportFull.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                importAllDataZip(file);
            }
        };
    }
}

// ============================================================
// 8. GEMINI API
// ============================================================

let isSending = false;

/**
 * システムプロンプトにメモリを合成した文字列を返す
 */
function buildSystemPrompt(char) {
    let systemPromptText = char.prompt || 'You are a helpful assistant.';
    const charMemories = AppState.memories.filter(m => m.charId === char.id);
    if (charMemories.length > 0) {
        systemPromptText += '\n\n【キャラクターの記憶（メモリ）】\n以下はこれまでの対話から抽出されたあなたの記憶です。あなた自身の一人称の記録であり、状況に応じて会話に自然に反映してください。\n';
        charMemories.forEach(m => {
            systemPromptText += `- [${formatDate(m.createdAt)}] ${m.content}\n`;
        });
    }
    return systemPromptText;
}

/**
 * コンテキスト情報付きのシステムプロンプトを構築する（非同期版）
 */
async function buildSystemPromptWithContext(char) {
    let systemPromptText = buildSystemPrompt(char);
    const contextSettings = char.contextSettings || null;
    if (contextSettings) {
        const contextStr = await buildContextString(contextSettings);
        if (contextStr) {
            systemPromptText += '\n\n' + contextStr;
        }
    }
    return systemPromptText;
}

async function handleSendMessage() {
    if (isSending) return;

    const inputEl = document.getElementById('chat-input');
    const text = inputEl.value.trim();
    if (!text) return;

    if (!AppState.apiKey) {
        alert('アプリ設定からAPIキーを設定してください。');
        return;
    }

    const thread = AppState.threads.find(t => t.id === AppState.activeThreadId);
    if (!thread) {
        alert('会話スレッドが見つかりません。スレッド一覧から選択してください。');
        return;
    }

    const char = AppState.characters.find(c => c.id === thread.charId);
    if (!char) {
        alert('キャラクターデータが見つかりません。');
        return;
    }

    // --- UI ロック ---
    isSending = true;
    const sendBtn = document.getElementById('btn-send');
    sendBtn.disabled = true;
    inputEl.disabled = true;

    // ユーザーメッセージをstateに追加
    thread.messages.push({
        role: 'user',
        text: text,
        timestamp: new Date().toISOString()
    });
    inputEl.value = '';
    saveData();
    renderChat(true); // 自分が送った時はスクロールさせる

    // ローディング表示
    const historyDiv = document.getElementById('chat-history');
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loading-indicator';
    loadingDiv.className = 'message-card msg-ai';
    const loadingText = document.createElement('div');
    loadingText.className = 'msg-text';
    loadingText.textContent = 'thinking...';
    loadingDiv.appendChild(loadingText);
    historyDiv.appendChild(loadingDiv);
    historyDiv.scrollTop = historyDiv.scrollHeight;

    try {
        const contents = thread.messages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        const systemPromptText = await buildSystemPromptWithContext(char);

        const reqBody = {
            systemInstruction: {
                parts: [{ text: systemPromptText }]
            },
            contents: contents,
            generationConfig: {
                maxOutputTokens: 8192
            }
        };

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${AppState.model}:generateContent?key=${AppState.apiKey}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData?.error?.message || `HTTPエラー: ${response.status}`;
            throw new Error(errMsg);
        }

        const data = await response.json();
        const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!aiText) {
            throw new Error('APIからの返答が空でした。');
        }

        // AIメッセージをstateに追加
        thread.messages.push({
            role: 'model',
            text: aiText,
            timestamp: new Date().toISOString(),
            modelUsed: AppState.model
        });

        // 初回対話後、スレッドタイトルを自動生成
        if (thread.messages.length === 2 && thread.title === '新しい会話') {
            generateThreadTitle(char.prompt, text, aiText).then(title => {
                if (title) {
                    thread.title = title;
                    document.getElementById('chat-header-title').textContent = title;
                    saveData();
                    renderCharacters(); // タイトル変更後にキャラ一覧のスレッド情報も更新
                }
            });
        }

        // --- メモリ抽出の判定 (非同期で裏側実行) ---
        const memoryKeywords = ['メモリに', '記憶して', '覚えておいて', '記録して', 'メモして'];
        const hasManualInstruction = memoryKeywords.some(kw => text.includes(kw));
        const isAutoTiming = thread.messages.length > 2 && thread.messages.length % 20 === 0;

        if (hasManualInstruction || isAutoTiming) {
            extractMemory(char, [...thread.messages], systemPromptText).then(memoryText => {
                if (memoryText && memoryText.toUpperCase() !== 'NONE') {
                    AppState.memories.push({
                        id: generateId(),
                        charId: char.id,
                        createdAt: new Date().toISOString(),
                        content: memoryText
                    });
                    saveData();
                    console.log('メモリが抽出・保存されました:', memoryText);
                }
            });
        }

        saveData();

    } catch (error) {
        console.error('API エラー:', error);
        thread.messages.pop();
        saveData(); // [修正] ロールバック後もsaveして不整合を防ぐ
        alert('エラーが発生しました: ' + error.message);
    } finally {
        const indicator = document.getElementById('loading-indicator');
        if (indicator) indicator.remove();

        isSending = false;
        sendBtn.disabled = false;
        inputEl.disabled = false;
        // inputEl.focus(); // [要請] 返信後の自動キーボード表示を無効化

        renderChat(false); // AI返信後は自動スクロールさせない
    }
}

async function generateThreadTitle(systemPrompt, firstUserMsg, firstAiMsg) {
    try {
        const reqBody = {
            systemInstruction: {
                parts: [{ text: '以下の会話の内容を、タイトルとして15文字以内で作成してください。タイトルのテキストのみを出力し、カギカッコや記号は付けないでください。' }]
            },
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `${firstUserMsg}\n\n${firstAiMsg}` }]
                }
            ]
        };
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${AppState.apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });
        if (response.ok) {
            const data = await response.json();
            const title = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            return title || null;
        }
    } catch (e) {
        console.error('タイトル生成失敗:', e);
    }
    return null;
}

/**
 * 過去の会話履歴からメモリを抽出する（裏側の非同期処理用）
 * メモリはキャラクターの完全一人称（日記形式）で記録される
 */
async function extractMemory(char, messages, systemPrompt) {
    try {
        const targetMessages = messages.slice(-30);

        const contents = targetMessages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));

        const charName = char.name || 'キャラクター';

        // メモリ抽出依頼（完全一人称・日記形式を明示）
        contents.push({
            role: 'user',
            parts: [{ text: `【システム指令：記憶の抽出】\nここまでの会話を振り返り、${charName}であるあなたが「今後も覚えておくべき新しい知識・ユーザーとの重要な約束や出来事」を、**あなた自身の一人称視点（日記のような形式）**で箇条書きに記録してください。\n\n【出力形式の例】\n- 今日、〇〇と△△について話した。俺は□□と伝えた。\n- 〇〇は△△が好きだと言っていた。覚えておこう。\n\n三人称（「${charName}は〇〇した」等）は禁止です。必ず一人称（俺/私/僕 等、キャラクターの口調に合わせて）で書いてください。\nもし、まだ会話の途中（キリが悪い）場合や、新しく記憶すべき情報が特にない場合は、余計な出力はせず「NONE」とだけ返答してください。` }]
        });

        const reqBody = {
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
            contents: contents,
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1024
            }
        };

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${AppState.apiKey}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });

        if (response.ok) {
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            return text;
        }
    } catch (e) {
        console.error('メモリ抽出失敗:', e);
    }
    return null;
}

// ============================================================
// 9. EXPORT FUNCTIONS
// ============================================================

function generateMarkdown(thread, charName) {
    let md = `# ${thread.title}\n`;
    md += `Character: ${charName}\n`;
    md += `Created: ${formatDate(thread.createdAt)}\n\n---\n\n`;

    if (!Array.isArray(thread.messages)) return md;

    thread.messages.forEach(m => {
        const role = m.role === 'user' ? 'user' : charName;
        let meta = formatDate(m.timestamp);
        if (m.modelUsed) meta += ` (${m.modelUsed})`;
        md += `# ${role} [${meta}]\n`;
        md += `${m.text}\n\n`;
    });
    return md;
}

function getFilename(thread, charName) {
    const d = new Date(thread.createdAt);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const safeTitle = thread.title.replace(/[\\/:*?"<>|]/g, '_');
    const safeChar = charName.replace(/[\\/:*?"<>|]/g, '_');
    return `${yyyy}${mm}${dd}_${safeChar}_${safeTitle}.md`;
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportCurrentThread() {
    const thread = AppState.threads.find(t => t.id === AppState.activeThreadId);
    if (!thread) return;
    const char = AppState.characters.find(c => c.id === thread.charId);
    if (!char) return;
    const md = generateMarkdown(thread, char.name);
    downloadFile(getFilename(thread, char.name), md);
}

async function exportAllThreadsZip() {
    if (AppState.threads.length === 0) {
        alert('出力するスレッドがありません。');
        return;
    }
    if (typeof JSZip === 'undefined') {
        alert('ZIPライブラリの読み込みに失敗しました。ネットワーク接続を確認してください。');
        return;
    }

    const zip = new JSZip();

    AppState.threads.forEach(t => {
        const char = AppState.characters.find(c => c.id === t.charId);
        const charName = char ? char.name : 'Unknown';
        const md = generateMarkdown(t, charName);
        const filename = getFilename(t, charName);
        zip.folder(`${charName.replace(/[\\/:*?"<>|]/g, '_')}_Logs`).file(filename, md);
    });

    try {
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        const d = new Date();
        const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        a.download = `${yyyymmdd}_AllCharacters_Logs.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('ZIP生成エラー:', e);
        alert('ZIPファイルの作成に失敗しました。');
    }
}

/**
 * 全データエクスポート (AppState + IndexedDB内の画像)
 */
async function exportAllDataZip() {
    if (!confirm('全てのデータ（設定、キャラクター、会話履歴、画像）をバックアップ用にZIPエクスポートしますか？')) return;

    if (typeof JSZip === 'undefined') {
        alert('ZIPライブラリの読み込みに失敗しました。');
        return;
    }

    const zip = new JSZip();
    
    // 1. AppState (JSON) - APIキーは除外
    const dataToSave = {
        model: AppState.model,
        roomModel: AppState.roomModel,
        characters: AppState.characters,
        threads: AppState.threads,
        memories: AppState.memories
    };
    zip.file('data.json', JSON.stringify(dataToSave, null, 2));

    // 2. Images (IndexedDB)
    try {
        const db = await openDB();
        const imagesFolder = zip.folder('images');
        
        const allImages = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readonly');
            const store = tx.objectStore(STORE_IMAGES);
            const results = [];
            
            const req = store.openCursor();
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    results.push({ key: cursor.key, blob: cursor.value });
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            req.onerror = () => reject(req.error);
        });

        allImages.forEach(img => {
            if (img.blob instanceof Blob) {
                imagesFolder.file(img.key, img.blob);
            }
        });

        console.log(`[Export] ${allImages.length} 枚の画像をアーカイブに追加しました`);
    } catch (e) {
        console.error('[Export] 画像の取得に失敗しました:', e);
        if (!confirm('画像データの取得に一部失敗しました。設定と履歴のみでエクスポートを続行しますか？')) return;
    }

    // 3. Generate and Download
    try {
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        const d = new Date();
        const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        a.download = `${yyyymmdd}_antigravity_backup.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('ZIP生成エラー:', e);
        alert('ZIPファイルの作成に失敗しました。');
    }
}

/**
 * 全データインポート (ZIPから復元)
 */
async function importAllDataZip(file) {
    if (!file) return;

    const warning = '【重要】全データインポートを実行すると、現在このブラウザに保存されているデータ（設定、キャラクター、履歴、画像すべて）は削除され、インポートする内容に置き換わります。\n\n本当によろしいですか？';
    if (!confirm(warning)) return;

    if (typeof JSZip === 'undefined') {
        alert('ZIPライブラリの読み込みに失敗しました。');
        return;
    }

    try {
        const zip = new JSZip();
        const loadedZip = await zip.loadAsync(file);
        
        // 1. Load data.json
        const dataFile = loadedZip.file('data.json');
        if (!dataFile) {
            throw new Error('バックアップファイル内に data.json が見つかりませんでした。有効なバックアップではありません。');
        }
        const dataJson = await dataFile.async('text');
        const importedData = JSON.parse(dataJson);

        // 2. Validate data
        if (!importedData.characters || !Array.isArray(importedData.characters)) {
            throw new Error('バックアップデータが不正です。');
        }

        // 3. Clear and Load Images to IndexedDB
        const db = await openDB();
        const imgFolder = loadedZip.folder('images');
        
        // Clear existing images
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_IMAGES, 'readwrite');
            const store = tx.objectStore(STORE_IMAGES);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });

        // Add new images
        const imageFiles = [];
        imgFolder.forEach((relativePath, file) => {
            if (!file.dir) {
                imageFiles.push({ key: relativePath, file });
            }
        });

        for (const img of imageFiles) {
            const blob = await img.file.async('blob');
            await saveImageToDB(img.key, blob);
        }
        console.log(`[Import] ${imageFiles.length} 枚の画像をリストアしました`);

        // 4. Update AppState and Save (APIキーは上書きしない)
        AppState.model = importedData.model || 'gemini-3.1-flash-lite-preview';
        AppState.roomModel = importedData.roomModel || 'gemini-3.1-flash-lite-preview';
        AppState.characters = importedData.characters;
        AppState.threads = importedData.threads || [];
        AppState.memories = importedData.memories || [];

        await saveData();

        alert('データのインポートが完了しました。\n※APIキーは再設定が必要です。\n\nアプリケーションを再読み込みします。');
        
        // 5. Reload (不具合が出づらい確実な方法として location.reload(true) は非推奨なため単純な reload)
        location.href = location.origin + location.pathname;

    } catch (e) {
        console.error('[Import] エラー:', e);
        alert('インポートに失敗しました: ' + e.message);
    }
}

// ============================================================
// 10. ROOM FEATURE
// ============================================================

/** Room用デバッグログ */
function roomLog(...args) { console.log('[Room]', ...args); }

/** fetchWithTimeout: AbortControllerでタイムアウト付きfetch */
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('リクエストがタイムアウトしました（30秒）');
        throw e;
    } finally {
        clearTimeout(timeoutId);
    }
}

/** 天気コードを絵文字に変換する */
function getWeatherEmoji(code) {
    const table = {
        0: '☀️',
        1: '🌤️',
        2: '⛅',
        3: '☁️',
        45: '🌫️', 48: '🌫️',
        51: '🌦️', 53: '🌦️', 55: '🌦️',
        56: '🌦️', 57: '🌦️',
        61: '🌧️', 63: '☔', 65: '🌊',
        66: '🧊', 67: '🧊',
        71: '🌨️', 73: '❄️', 75: '☃️',
        77: '🌨️',
        80: '🌦️', 81: '🌧️', 82: '⛈️',
        85: '🌨️', 86: '❄️',
        95: '⛈️', 96: '🌩️', 99: '🌩️'
    };
    return table[code] || '❓';
}

/** キャラクターのRoom関連データを遅延初期化 */
function ensureRoomData(char) {
    if (!char.roomSettings) {
        char.roomSettings = {
            bgMorning: '', bgEvening: '', bgNight: '',
            charNormal: '', charHappy: '', charAngry: '', charSad: '', charSleepy: '', charShy: '', charTroubled: ''
        };
    }
    if (!char.roomState) {
        char.roomState = {
            mood: 'normal', moodValue: 50,
            items: [], schedule: null, scheduleDate: '',
            lastAccessTime: null, accessHistory: [],
            weatherCache: null
        };
    }
    if (!Array.isArray(char.roomLogs)) char.roomLogs = [];
    if (!Array.isArray(char.diary)) char.diary = [];
    if (!Array.isArray(char.roomLongTermMemory)) char.roomLongTermMemory = [];
}

/** 機嫌のアイコンとテキストを返す */
function getMoodDisplay(mood, moodValue) {
    const moods = {
        happy:    { icon: '😄', text: 'ハッピー' },
        angry:    { icon: '😠', text: 'イライラ' },
        sad:      { icon: '😢', text: '悲しみ' },
        sleepy:   { icon: '😴', text: '眠い' },
        shy:      { icon: '😳', text: '照れ' },
        troubled: { icon: '😰', text: '困り' },
        normal:   { icon: '😊', text: '普通' }
    };
    const m = moods[mood] || moods.normal;
    if (moodValue >= 80) m.text += ' ♪';
    else if (moodValue <= 20) m.text += ' …';
    return m;
}

/** 現在の時間帯を返す: morning / evening / night */
function getTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 5 && h < 16) return 'morning';
    if (h >= 16 && h < 19) return 'evening';
    return 'night';
}

/** お風呂時間判定 */
function isInBathTime(schedule) {
    if (!schedule || !schedule.bath_time) return false;
    const match = schedule.bath_time.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) return false;
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    
    let startMins = parseInt(match[1]) * 60 + parseInt(match[2]);
    let endMins = parseInt(match[3]) * 60 + parseInt(match[4]);
    
    if (endMins < startMins) {
        // 日付跨ぎ
        if (currentMins >= startMins || currentMins < endMins) return true;
    } else {
        if (currentMins >= startMins && currentMins < endMins) return true;
    }
    return false;
}

// ObjectURLのキャッシュ（メモリリーク防止用）
const roomBlobUrls = { bg: null, weather: null, char: null };
const globalBlobUrls = { bg: null, char: null };

/** Room画面のビジュアルを更新（背景・天気・キャラ画像・機嫌） */
async function updateRoomVisuals(char) {
    ensureRoomData(char);
    const state = char.roomState;
    const bgLayer = document.getElementById('room-bg-layer');
    const weatherWin = document.getElementById('room-weather-window');
    const charLayer = document.getElementById('room-char-layer');
    
    // お風呂判定
    const isBath = isInBathTime(state.schedule);
    let existingBadge = document.getElementById('room-bath-badge');
    if (isBath) {
        if (!existingBadge) {
            existingBadge = document.createElement('div');
            existingBadge.id = 'room-bath-badge';
            existingBadge.className = 'room-bath-badge';
            existingBadge.textContent = '♨️ 現在入浴中';
            document.getElementById('room-view').appendChild(existingBadge);
        }
    } else if (existingBadge) {
        existingBadge.remove();
    }

    // 画像ロード補助関数
    const loadImg = async (type, key, element) => {
        if (roomBlobUrls[type]) URL.revokeObjectURL(roomBlobUrls[type]);
        const url = await loadImageFromDB(`${char.id}_${key}`);
        roomBlobUrls[type] = url;
        if (url) {
            element.style.backgroundImage = `url('${url}')`;
            return true;
        } else {
            element.style.backgroundImage = '';
            return false;
        }
    };

    // 背景
    const tod = getTimeOfDay();
    const bgKeyMap = { morning: 'bgMorning', evening: 'bgEvening', night: 'bgNight' };
    const bgKey = bgKeyMap[tod];
    if (bgKey) {
        let hasImg = await loadImg('bg', bgKey, bgLayer);
        if (!hasImg && bgKey !== 'bgMorning') {
             hasImg = await loadImg('bg', 'bgMorning', bgLayer);
        }
        bgLayer.className = hasImg ? 'room-layer' : 'room-layer room-bg-default';
    } else {
        if (roomBlobUrls.bg) URL.revokeObjectURL(roomBlobUrls.bg);
        roomBlobUrls.bg = null;
        bgLayer.className = 'room-layer room-bg-default';
        bgLayer.style.backgroundImage = '';
    }

    // 天気
    const wCache = state.weatherCache;
    const weather = wCache?.weather || 'sunny';
    const weatherFileMap = { sunny: 'hare.jpg', cloudy: 'kumori.jpg', rainy: 'ame.jpg', snowy: 'yuki.jpg' };
    const wFile = weatherFileMap[weather];

    // 以前のObjectURLが残っていれば破棄
    if (roomBlobUrls.weather) {
        URL.revokeObjectURL(roomBlobUrls.weather);
        roomBlobUrls.weather = null;
    }

    if (wFile) {
        weatherWin.style.backgroundImage = `url('../image/${wFile}')`;
        weatherWin.style.display = 'flex'; // flexに変更して中身を表示

        // 詳細情報の表示
        const detailEl = document.getElementById('room-weather-detail');
        const tempEl = document.getElementById('room-weather-temp');
        const probEl = document.getElementById('room-weather-prob');

        if (detailEl && wCache && typeof wCache.code === 'number') {
            detailEl.textContent = getWeatherEmoji(wCache.code);
        }
        if (tempEl && wCache && typeof wCache.maxTemp === 'number') {
            tempEl.textContent = `${Math.round(wCache.maxTemp)}℃/${Math.round(wCache.minTemp)}℃`;
        }
        if (probEl && wCache && typeof wCache.pop === 'number') {
            probEl.textContent = `${wCache.pop}%`;
        }
    } else {
        weatherWin.style.backgroundImage = '';
        weatherWin.style.display = 'none';
    }

    // キャラクター
    const mood = state.mood || 'normal';
    const charKeyMap = { normal: 'charNormal', happy: 'charHappy', angry: 'charAngry', sad: 'charSad', sleepy: 'charSleepy', shy: 'charShy', troubled: 'charTroubled' };
    const cKey = charKeyMap[mood];
    
    if (isBath) {
        if (roomBlobUrls.char) URL.revokeObjectURL(roomBlobUrls.char);
        roomBlobUrls.char = null;
        charLayer.style.backgroundImage = '';
    } else if (cKey) {
        let hasChar = await loadImg('char', cKey, charLayer);
        if (!hasChar && cKey !== 'charNormal') {
            hasChar = await loadImg('char', 'charNormal', charLayer);
        }
        if (!hasChar) {
            if (roomBlobUrls.char) URL.revokeObjectURL(roomBlobUrls.char);
            roomBlobUrls.char = null;
            charLayer.style.backgroundImage = '';
        }
    } else {
        if (roomBlobUrls.char) URL.revokeObjectURL(roomBlobUrls.char);
        roomBlobUrls.char = null;
        charLayer.style.backgroundImage = '';
    }

    // 機嫌表示
    const md = getMoodDisplay(mood, state.moodValue);
    document.getElementById('room-mood-icon').textContent = md.icon;
    document.getElementById('room-mood-text').textContent = md.text;
}

/** スレッド・チャット画面のグローバル背景を更新 */
async function updateGlobalBackground(charId) {
    const bgLayer = document.getElementById('global-bg-layer');
    const charLayer = document.getElementById('global-char-layer');
    const overlay = document.getElementById('global-overlay-layer');
    if (!bgLayer || !charLayer || !overlay) return;

    if (!charId) {
        bgLayer.style.display = 'none';
        charLayer.style.display = 'none';
        overlay.style.display = 'none';
        if (globalBlobUrls.bg) URL.revokeObjectURL(globalBlobUrls.bg);
        if (globalBlobUrls.char) URL.revokeObjectURL(globalBlobUrls.char);
        globalBlobUrls.bg = null;
        globalBlobUrls.char = null;
        bgLayer.style.backgroundImage = '';
        charLayer.style.backgroundImage = '';
        return;
    }

    const char = AppState.characters.find(c => c.id === charId);
    if (!char) return;

    ensureRoomData(char);
    const state = char.roomState;
    const isBath = isInBathTime(state.schedule);

    // 画像ロード補助関数
    const loadImg = async (type, key, element) => {
        if (globalBlobUrls[type]) URL.revokeObjectURL(globalBlobUrls[type]);
        const url = await loadImageFromDB(`${char.id}_${key}`);
        globalBlobUrls[type] = url;
        if (url) {
            element.style.backgroundImage = `url('${url}')`;
            return true;
        } else {
            element.style.backgroundImage = '';
            return false;
        }
    };

    // 背景
    const tod = getTimeOfDay();
    const bgKeyMap = { morning: 'bgMorning', evening: 'bgEvening', night: 'bgNight' };
    const bgKey = bgKeyMap[tod];
    if (bgKey) {
        let hasImg = await loadImg('bg', bgKey, bgLayer);
        if (!hasImg && bgKey !== 'bgMorning') hasImg = await loadImg('bg', 'bgMorning', bgLayer);
        bgLayer.className = hasImg ? 'room-layer' : 'room-layer room-bg-default';
    } else {
        if (globalBlobUrls.bg) URL.revokeObjectURL(globalBlobUrls.bg);
        globalBlobUrls.bg = null;
        bgLayer.className = 'room-layer room-bg-default';
        bgLayer.style.backgroundImage = '';
    }

    // キャラクター
    const mood = state.mood || 'normal';
    const charKeyMap = { normal: 'charNormal', happy: 'charHappy', angry: 'charAngry', sad: 'charSad', sleepy: 'charSleepy', shy: 'charShy', troubled: 'charTroubled' };
    const cKey = charKeyMap[mood];
    
    if (isBath) {
        if (globalBlobUrls.char) URL.revokeObjectURL(globalBlobUrls.char);
        globalBlobUrls.char = null;
        charLayer.style.backgroundImage = '';
    } else if (cKey) {
        let hasChar = await loadImg('char', cKey, charLayer);
        if (!hasChar && cKey !== 'charNormal') hasChar = await loadImg('char', 'charNormal', charLayer);
        if (!hasChar) {
            if (globalBlobUrls.char) URL.revokeObjectURL(globalBlobUrls.char);
            globalBlobUrls.char = null;
            charLayer.style.backgroundImage = '';
        }
    }

    bgLayer.style.display = 'block';
    charLayer.style.display = 'block';
    overlay.style.display = 'block';
}

// --- 天気取得 ---
async function fetchWeather(char) {
    ensureRoomData(char);
    const today = new Date().toISOString().slice(0, 10);
    // キャッシュが今日のもので、かつ詳細データ(code等)が含まれているかチェック
    if (char.roomState.weatherCache && char.roomState.weatherCache.date === today && typeof char.roomState.weatherCache.code === 'number') {
        roomLog('天気キャッシュ使用:', char.roomState.weatherCache.weather);
        return char.roomState.weatherCache.weather;
    }

    let lat, lon;
    try {
        const pos = await new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('Geolocation非対応'));
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 }); // 少し短めに
        });
        lat = pos.coords.latitude.toFixed(3);
        lon = pos.coords.longitude.toFixed(3);
        roomLog('位置情報取得成功:', lat, lon);
    } catch (e) {
        // 位置情報取得失敗時はデフォルト設定
        lat = 35.543;
        lon = 139.446;
        roomLog('位置情報取得失敗、デフォルトを使用:', e.message);
    }

    try {
        // 気温、降水確率も同時に取得
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo`;
        const resp = await fetchWithTimeout(url, {}, 15000);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        
        const code = data?.current_weather?.weathercode ?? 0;
        const maxTemp = data?.daily?.temperature_2m_max?.[0] ?? 0;
        const minTemp = data?.daily?.temperature_2m_min?.[0] ?? 0;
        const pop = data?.daily?.precipitation_probability_max?.[0] ?? 0;

        let weather = 'sunny';
        if ([1, 2, 3, 45, 48].includes(code)) weather = 'cloudy';
        else if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) weather = 'rainy';
        else if ([71, 73, 75, 77, 85, 86].includes(code)) weather = 'snowy';

        char.roomState.weatherCache = { 
            date: today, 
            weather, 
            code, 
            maxTemp, 
            minTemp, 
            pop 
        };
        saveData();
        roomLog('天気取得成功:', weather, '(code:', code, 'Temp:', maxTemp, '/', minTemp, 'PoP:', pop, '%)');
        return weather;
    } catch (e) {
        roomLog('天気取得失敗（デフォルト: sunny）:', e.message);
        char.roomState.weatherCache = { 
            date: today, 
            weather: 'sunny', 
            code: 0, 
            maxTemp: 20, 
            minTemp: 10, 
            pop: 0 
        };
        saveData();
        return 'sunny';
    }
}

// --- 朝5時跨ぎ判定 ---
function hasCrossed5am(lastAccessISO) {
    if (!lastAccessISO) return true;
    const last = new Date(lastAccessISO);
    const now = new Date();
    const get5am = (d) => {
        const t = new Date(d);
        t.setHours(5, 0, 0, 0);
        if (d.getHours() < 5) t.setDate(t.getDate() - 1);
        return t;
    };
    const last5am = get5am(last);
    const now5am = get5am(now);
    return now5am > last5am;
}

// --- Room用 Gemini API呼び出し ---
async function callRoomAPI(systemPrompt, userMessage) {
    if (!AppState.apiKey) throw new Error('APIキーが設定されていません');
    const reqBody = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
    };
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${AppState.roomModel}:generateContent?key=${AppState.apiKey}`;
    roomLog('API呼び出し:', AppState.roomModel);
    const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
    });
    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTPエラー: ${response.status}`);
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error('APIからの返答が空でした');
    return text;
}

/** AI応答のJSONをパースする（フォールバック付き） */
function parseRoomResponse(text) {
    try {
        let jsonStr = text;
        const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (mdMatch) jsonStr = mdMatch[1].trim();
        if (!jsonStr.startsWith('{')) {
            const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (braceMatch) jsonStr = braceMatch[0];
        }
        const parsed = JSON.parse(jsonStr);
        return {
            message: parsed.message || '',
            mood: parsed.mood || 'normal',
            moodValue: typeof parsed.mood_value === 'number' ? Math.max(0, Math.min(100, parsed.mood_value)) : 50,
            gainedItems: Array.isArray(parsed.gained_items) ? parsed.gained_items : [],
            lostItems: Array.isArray(parsed.lost_items) ? parsed.lost_items : [],
            updatedItems: Array.isArray(parsed.updated_items) ? parsed.updated_items : [],
            currentActivity: parsed.current_activity || '',
            monologue: parsed.monologue || ''
        };
    } catch (e) {
        roomLog('JSONパース失敗、テキストで返却:', e.message);
        return { 
            message: text, mood: 'normal', moodValue: 50, 
            gainedItems: [], lostItems: [], updatedItems: [], 
            currentActivity: '', monologue: '' 
        };
    }
}

/** Room用コンテキスト（システムプロンプト）を構築 */
async function buildRoomContext(char) {
    ensureRoomData(char);
    let ctx = char.prompt || 'You are a helpful assistant.';

    // メモリ
    const charMemories = AppState.memories.filter(m => m.charId === char.id);
    if (charMemories.length > 0) {
        ctx += '\n\n【キャラクターの記憶（メモリ）】\n';
        charMemories.forEach(m => { ctx += `- [${formatDate(m.createdAt)}] ${m.content}\n`; });
    }

    // 長期記憶
    if (char.roomLongTermMemory.length > 0) {
        ctx += '\n\n【長期記憶（過去の要約）】\n';
        char.roomLongTermMemory.forEach(m => { ctx += `- [${m.period}] ${m.summary}\n`; });
    }

    ctx += '\n\nあなたは今、自分のRoomにいます。ユーザがあなたのRoomを訪れました。';

    // 現在の状態
    ctx += '\n\n【現在の状態】\n';
    ctx += `現在日時: ${getDatetimeString() || new Date().toLocaleString('ja-JP')}\n`;
    const weather = char.roomState.weatherCache?.weather || 'sunny';
    const weatherNames = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', snowy: '雪' };
    ctx += `今日の天気: ${weatherNames[weather] || '晴れ'}\n`;
    ctx += `現在の機嫌: ${char.roomState.mood} (${char.roomState.moodValue}/100)\n`;
    
    // グッズ一覧（state, gifted対応）
    const itemsList = char.roomState.items.map(i => {
        let txt = i.name;
        if (i.gifted) txt += ' (ユーザからの贈り物)';
        if (i.state) txt += ` [状態: ${i.state}]`;
        return txt;
    }).join('\n- ') || 'なし';
    ctx += `所持グッズ:\n- ${itemsList}\n`;

    // スケジュール
    if (char.roomState.schedule) {
        const s = char.roomState.schedule;
        ctx += '\n【本日のスケジュール】\n';
        ctx += `起床:${s.wake_up||'?'} 午前:${s.morning||'?'} 昼:${s.noon||'?'}\n`;
        ctx += `夕方:${s.evening||'?'} 夜:${s.night||'?'} 睡眠等:${s.late_night||'?'} 就寝:${s.bed_time||'?'}\n`;
        if (s.bath_time) ctx += `風呂:${s.bath_time}\n`;
    }

    // room会話ログ（直近30件）
    const recentLogs = char.roomLogs.slice(-30);
    const summaryLog = char.roomLogs.find(l => l.isSummary);
    
    // 最近30件の中に含まれていない要約ログがあれば、過去の記憶として追加
    if (summaryLog && !recentLogs.includes(summaryLog)) {
        ctx += '\n【これまでの重要な記憶・ダイジェスト】\n';
        ctx += `${summaryLog.text}\n`;
    }

    if (recentLogs.length > 0) {
        ctx += '\n【最近のRoomでの会話】\n';
        recentLogs.forEach(l => {
            const role = l.role === 'user' ? 'ユーザ' : (l.role === 'system' ? 'システム' : char.name);
            ctx += `[${role} ${formatDate(l.timestamp)}] ${l.text}\n`;
        });
    }

    // 日記（直近5件）
    const recentDiary = char.diary.slice(-5);
    if (recentDiary.length > 0) {
        ctx += '\n【最近の日記 (直近5件)】\n';
        recentDiary.forEach(d => { ctx += `[${d.date}] ${d.content}\n`; });
    }

    // 通常チャットの直近30件
    const charThreads = AppState.threads.filter(t => t.charId === char.id);
    const allMsgs = [];
    charThreads.forEach(t => {
        if (Array.isArray(t.messages)) {
            t.messages.forEach(m => allMsgs.push(m));
        }
    });
    allMsgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const recent20 = allMsgs.slice(-20);
    if (recent20.length > 0) {
        ctx += '\n【通常会話スレッドの直近20件の会話】\n';
        recent20.forEach(m => {
            const role = m.role === 'user' ? 'ユーザ' : char.name;
            ctx += `[${role} ${formatDate(m.timestamp)}] ${m.text.substring(0, 200)}\n`;
        });
    }

    // アクセス履歴（直近10件）
    const recentAccess = char.roomState.accessHistory.slice(-10);
    if (recentAccess.length > 0) {
        ctx += '\n【Roomへのアクセス履歴】\n';
        recentAccess.forEach(a => { ctx += `${formatDate(a.time)}\n`; });
    }

    // 最後のアクセスからの経過時間
    if (char.roomState.lastAccessTime) {
        try {
            const lastTime = new Date(char.roomState.lastAccessTime);
            const now = new Date();
            const diffMs = now - lastTime;
            if (diffMs > 0) {
                const diffMin = Math.floor(diffMs / (1000 * 60));
                const diffHours = Math.floor(diffMin / 60);
                const diffDays = Math.floor(diffHours / 24);
                
                let timeStr = "";
                if (diffDays > 0) timeStr = `${diffDays}日${diffHours % 24}時間ぶり`;
                else if (diffHours > 0) timeStr = `${diffHours}時間${diffMin % 60}分ぶり`;
                else timeStr = `${diffMin}分ぶり`;
                
                ctx += `\n前回アクセスから約${timeStr}の訪問(または会話の続き)です。`;
            }
        } catch (e) {
            roomLog('経過時間計算エラー:', e.message);
        }
    }

    // 端末情報
    const contextSettings = char.contextSettings || null;
    if (contextSettings) {
        const ctxStr = await buildContextString(contextSettings);
        if (ctxStr) ctx += '\n\n' + ctxStr;
    }

    const isBath = isInBathTime(char.roomState.schedule);

    // 返答ルール
    ctx += `\n\n【状況と指示】
ユーザがあなたのRoomを訪れました。（または会話の続きです）
現在あなたは以下の状態です。
- 時刻: ${new Date().toLocaleTimeString('ja-JP')}
- スケジュール上の状況: ${isBath ? '現在お風呂に入っています（ユーザからは姿が見えず、声だけが聞こえる状態です）' : '室内にいます'}

必ず以下のJSON形式のみで返答してください。**JSON以外のテキストは絶対に出力しないでください。**
{
  "message": "ユーザへの発言テキスト（お風呂中の場合はお風呂の中から返答すること）",
  "current_activity": "あなたが【今この瞬間】何をしているかの具体的な状況描写(例: 本のページをめくっている、お風呂で鼻歌をうたっている 等)",
  "monologue": "今のあなたの心の中の独り言",
  "mood": "normal/happy/angry/sad/sleepy/shy/troubled のいずれか。ユーザへの発言に合わせて気分を選択すること",
  "mood_value": 機嫌値 0-100 (0=最悪, 50=普通, 100=最高),
  "gained_items": ["新たに手に入れたグッズ名"],
  "lost_items": ["手放したグッズ名"],
  "updated_items": [{"name": "既存グッズ名", "state": "変化した状態(例: 付箋が増えた 等)", "protected": true/false}]
}

【注意事項】
- messageは必ずキャラクターとして自然に話しかけてください。（数言程度）過去の会話を確認し、コピペのような繰り返し台詞は言わずにバリエーション豊かに話しかけてください。
- 現在所持しているグッズの中で、自立的に使用・消費・破棄したものがあれば \`updated_items\` で \`state\`（状態）を更新してください。これがないと部屋の時間が止まっているように見えます。
- **「捨てたくない大切なグッズ」がある場合、\`updated_items\` 内で \`protected: true\` を設定してください（最大5個まで）。**
- **反対に不要になったものは \`protected: false\` に戻すか、そのまま \`lost_items\` に入れて破棄してください。**
- グッズの数が10を超える場合は、\`protected: true\` 以外のグッズを優先的に \`lost_items\` に入れて破棄し、10以下にするよう努めてください。破棄した場合は会話で触れてください。
- ユーザの不在時に自力で入手したグッズがあれば、 \`gained_items\` に追加し、会話で触れてください。入手したものがなければ追加は不要です。`;

    return ctx;
}

/** 機嫌・グッズを更新しUIに反映 */
function applyRoomResponse(char, parsed) {
    char.roomState.mood = parsed.mood;
    char.roomState.moodValue = parsed.moodValue;
    
    // グッズ追加
    parsed.gainedItems.forEach(name => {
        if (name && !char.roomState.items.find(i => i.name === name)) {
            char.roomState.items.push({ name, state: '', gifted: false, acquiredAt: new Date().toISOString() });
            char.roomLogs.push({ role: 'system', text: `【グッズ取得】 ${name}`, timestamp: new Date().toISOString() });
            roomLog('グッズ追加:', name);
        }
    });

    // グッズ状態更新
    parsed.updatedItems.forEach(upd => {
        if (!upd.name) return;
        const item = char.roomState.items.find(i => i.name.trim() === upd.name.trim());
        if (item) {
            if (upd.state !== undefined && item.state !== upd.state) {
                item.state = upd.state;
                char.roomLogs.push({ role: 'system', text: `【グッズ状態変化】 ${item.name} → ${item.state}`, timestamp: new Date().toISOString() });
                roomLog('グッズ状態更新:', item.name, '->', item.state);
            }
            // 捨てないでフラグ (protected) の更新
            if (upd.protected !== undefined) {
                // 最大5個制限のチェック（自分自身が既にprotectedならカウントから除く）
                const protectedCount = char.roomState.items.filter(i => i.protected && i.name !== item.name).length;
                if (upd.protected && protectedCount >= 5) {
                    roomLog('警告: protected枠がいっぱいです(5個)。', item.name, 'の保護に失敗。');
                } else {
                    item.protected = upd.protected;
                    roomLog('グッズ保護状態更新:', item.name, 'protected:', item.protected);
                }
            }
        } else {
            roomLog('警告: 更新対象のグッズが見つかりません:', upd.name);
        }
    });

    // グッズ削除
    parsed.lostItems.forEach(name => {
        if (!name) return;
        const targetName = name.trim();
        const idx = char.roomState.items.findIndex(i => i.name.trim() === targetName);
        if (idx >= 0) {
            const targetItem = char.roomState.items[idx];
            // protectedフラグが立っているものは削除をスキップ（念のため）
            if (targetItem.protected) {
                roomLog('削除スキップ(保護中):', targetItem.name);
                return;
            }
            char.roomState.items.splice(idx, 1);
            char.roomLogs.push({ role: 'system', text: `【グッズ喪失】 ${targetItem.name}`, timestamp: new Date().toISOString() });
            roomLog('グッズ削除:', targetItem.name);
        } else {
            roomLog('警告: 削除対象のグッズが見つかりません:', name);
        }
    });

    // currentActivity / monologue のDOM更新
    const actElem = document.getElementById('room-current-activity');
    const monoElem = document.getElementById('room-monologue');
    if (actElem) actElem.textContent = parsed.currentActivity || '';
    if (monoElem) monoElem.textContent = parsed.monologue ? `「${parsed.monologue}」` : '';
    
    // アニメーションのリトリガー
    if (actElem) {
        actElem.style.animation = 'none';
        actElem.offsetHeight; // reflow
        actElem.style.animation = 'roomFadeIn 0.6s ease';
    }
    if (monoElem) {
        monoElem.style.animation = 'none';
        monoElem.offsetHeight; // reflow
        monoElem.style.animation = 'roomFadeIn 0.8s ease';
    }

    saveData();
    updateRoomVisuals(char); // ここは非同期だがFire&ForgetでOK
}

// --- 日記生成 ---
async function generateDiary(char) {
    roomLog('日記生成開始');
    const prompt = (char.prompt || '') + `\n\n【指示】あなたは日記を書きます。前日あったことや印象に残ったことの感想の一言二言程度を、あなたの一人称で書いてください。
必ず以下のJSON形式のみで返答してください: {"diary": "日記の内容テキスト"}`;
    const userMsg = `今日の日付: ${new Date().toLocaleDateString('ja-JP')}。昨日のスケジュール: ${JSON.stringify(char.roomState.schedule || {})}。最近のRoom会話: ${char.roomLogs.slice(-10).map(l => l.text).join(' / ')}`;
    try {
        const raw = await callRoomAPI(prompt, userMsg);
        const parsed = parseRoomResponse(raw);
        let diaryText = '';
        try {
            const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
            diaryText = j.diary || parsed.message || raw;
        } catch { diaryText = parsed.message || raw; }
        const dateStr = new Date().toLocaleDateString('ja-JP');
        char.diary.push({ date: dateStr, content: diaryText });
        saveData();
        roomLog('日記生成完了:', diaryText.substring(0, 50));
    } catch (e) {
        roomLog('日記生成失敗:', e.message);
    }
}

// --- スケジュール生成 ---
async function generateSchedule(char) {
    roomLog('スケジュール生成開始');
    const prompt = (char.prompt || '') + `\n\n【指示】あなたは今日一日のスケジュールを決めます。あなたの性格や季節、天気に合わせて、自然で現実的なスケジュールを決めてください。
起床や就寝の時間は日ごとに柔軟に変えて構いません（例: 休日は少し遅めなど）。お風呂の時間(\`bath_time\`)も設定してください(風呂に入らない場合は入らない旨を明記してください)
必ず以下のJSON形式のみで返答してください:
{"wake_up": "時間(例: 7:30)", "morning": "活動内容", "noon": "活動内容", "evening": "活動内容", "night": "活動内容", "bath_time": "時間(例: 21:00-21:30)", "late_night": "活動内容", "bed_time": "時間(例: 23:30)"}`;
    const userMsg = `今日の日付: ${new Date().toLocaleDateString('ja-JP')}、天気: ${char.roomState.weatherCache?.weather || 'sunny'}`;
    try {
        const raw = await callRoomAPI(prompt, userMsg);
        let schedule;
        try {
            schedule = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
        } catch { schedule = { wake_up: '7:30', morning: '自由時間', noon: '昼食', evening: '自由時間', night: 'リラックス', bath_time: '21:00-21:30', late_night: '就寝準備', bed_time: '23:30' }; }
        char.roomState.schedule = schedule;
        char.roomState.scheduleDate = new Date().toISOString().slice(0, 10);
        saveData();
        roomLog('スケジュール生成完了:', JSON.stringify(schedule));
    } catch (e) {
        roomLog('スケジュール生成失敗:', e.message);
    }
}

// --- ルーム会話ログ自動要約 ---
async function summarizeRoomLogs(char) {
    if (!char.roomLogs || char.roomLogs.length <= 500) return;

    roomLog('ログ要約処理開始(500件超え)', char.roomLogs.length);
    const msgElem = document.getElementById('room-char-message');
    if (msgElem) {
        msgElem.textContent = '要約処理中...';
        msgElem.classList.add('room-loading');
    }

    const logsToSummarize = char.roomLogs.slice(0, 100);
    const logsText = logsToSummarize.map(l => `[${l.role} ${formatDate(l.timestamp)}] ${l.text}`).join('\n');

    const prompt = (char.prompt || '') + `\n\n【指示】
あなたはこれまでRoomで交わされた100件の会話ログを要約します。
・おはよう、おやすみ等の日常的な挨拶や、繰り返されている日々の内容、システムメッセージの羅列は省略してください。
・キャラクターの「心境の変化」「約束事」「印象に残った出来事（グッズの取得や廃棄など）」といった重要なニュアンスのみを抽出してください。
・重要な出来事には必ず [YYYY/MM/DD HH:mm] の形式で時刻を付記してください。
・要約自体はあなたの視点（一人称）の備忘録形式で書いてください。
・回答は JSON 形式ではなく、プレーンテキストのみで出力してください。`;

    try {
        const raw = await callRoomAPI(prompt, `【過去100件の会話ログ】\n${logsText}`);
        // 先頭や末尾のマークダウンを削除
        let summaryText = raw.replace(/^```json\n|^```text\n|^```\n|```$/gm, '').trim();

        const summaryLog = {
            role: 'system',
            isSummary: true,
            text: `【過去の記憶の要約】\n${summaryText}`,
            timestamp: new Date().toISOString()
        };

        // 先頭100件を削除し、代わりに要約ログ1件を差し込む
        char.roomLogs.splice(0, 100, summaryLog);
        saveData();
        roomLog('ログ要約処理完了');
    } catch (e) {
        roomLog('ログ要約処理失敗:', e.message);
    }
}

// --- Room入室処理 ---
let isRoomBusy = false;

async function enterRoom(charId) {
    if (isRoomBusy) return;
    isRoomBusy = true;
    const char = AppState.characters.find(c => c.id === charId);
    if (!char) { isRoomBusy = false; return; }
    ensureRoomData(char);

    // UI初期表示
    document.getElementById('room-char-message').textContent = '...';
    document.getElementById('room-char-message').classList.add('room-loading');
    document.getElementById('room-reply-input').value = '';
    document.getElementById('room-reply-input').disabled = true;
    document.getElementById('btn-room-send').disabled = true;
    
    // UI側の現在行動をいったん隠す
    const actElem = document.getElementById('room-current-activity');
    const monoElem = document.getElementById('room-monologue');
    if (actElem) actElem.textContent = '';
    if (monoElem) monoElem.textContent = '';
    
    showView('room');
    await updateRoomVisuals(char);

    try {
        // 天気取得
        await fetchWeather(char);

        // 朝5時跨ぎチェック または スケジュール未設定チェック
        const crossed5am = hasCrossed5am(char.roomState.lastAccessTime);
        const needsSchedule = !char.roomState.schedule;

        if (crossed5am || needsSchedule) {
            roomLog(crossed5am ? '朝5時を跨ぎました。日次処理を実行します。' : 'スケジュールが未設定のため生成を実行します。');
            if (char.roomState.lastAccessTime && crossed5am) {
                await generateDiary(char);
                await summarizeRoomLogs(char); // ← ログ500件超え要約処理を追加
            }
            await generateSchedule(char);
            // スケジュール変更に伴うお風呂判定などのため再更新
            await updateRoomVisuals(char);
        }

        // アクセス記録
        char.roomState.accessHistory.push({ time: new Date().toISOString() });
        if (char.roomState.accessHistory.length > 50) {
            char.roomState.accessHistory = char.roomState.accessHistory.slice(-50);
        }
        char.roomState.lastAccessTime = new Date().toISOString();
        saveData();

        await updateRoomVisuals(char);

        // 挨拶生成
        const systemPrompt = await buildRoomContext(char);
        const raw = await callRoomAPI(systemPrompt, 'ユーザがRoomを訪れました。挨拶してください。');
        const parsed = parseRoomResponse(raw);
        roomLog('挨拶応答:', parsed);

        // 会話ログに追加
        char.roomLogs.push({
            role: 'model', text: parsed.message,
            mood: parsed.mood, timestamp: new Date().toISOString()
        });

        applyRoomResponse(char, parsed);

        document.getElementById('room-char-message').textContent = parsed.message || '…';
        document.getElementById('room-char-message').classList.remove('room-loading');
    } catch (e) {
        roomLog('Room入室エラー:', e.message);
        document.getElementById('room-char-message').textContent = '(通信エラーが発生しました)';
        document.getElementById('room-char-message').classList.remove('room-loading');
    } finally {
        document.getElementById('room-reply-input').disabled = false;
        document.getElementById('btn-room-send').disabled = false;
        isRoomBusy = false;

        // データ量チェック（非同期で実行）
        checkDataLimits(char);
    }
}

// --- ユーザ返信処理 ---
async function handleRoomReply() {
    if (isRoomBusy) return;
    const input = document.getElementById('room-reply-input');
    const text = input.value.trim();
    if (!text) return;
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    ensureRoomData(char);

    isRoomBusy = true;
    input.value = '';
    input.disabled = true;
    document.getElementById('btn-room-send').disabled = true;
    document.getElementById('room-char-message').textContent = 'thinking...';
    document.getElementById('room-char-message').classList.add('room-loading');

    // ユーザメッセージをログに追加
    char.roomLogs.push({ role: 'user', text, timestamp: new Date().toISOString() });
    saveData();

    try {
        const systemPrompt = await buildRoomContext(char);
        const raw = await callRoomAPI(systemPrompt, text);
        const parsed = parseRoomResponse(raw);
        roomLog('返信応答:', parsed);

        // 返答をログに追加
        char.roomLogs.push({
            role: 'model', text: parsed.message,
            mood: parsed.mood, timestamp: new Date().toISOString()
        });

        applyRoomResponse(char, parsed);
        document.getElementById('room-char-message').textContent = parsed.message || '…';
        document.getElementById('room-char-message').classList.remove('room-loading');
    } catch (e) {
        roomLog('返信エラー:', e.message);
        document.getElementById('room-char-message').textContent = '(エラーが発生しました: ' + e.message + ')';
        document.getElementById('room-char-message').classList.remove('room-loading');
    } finally {
        input.disabled = false;
        document.getElementById('btn-room-send').disabled = false;
        // input.focus(); // Prevent auto-keypad showing
        isRoomBusy = false;
    }
}

// --- グッズ贈呈処理 ---
async function handleRoomGift() {
    const input = document.getElementById('room-gift-input');
    const name = input.value.trim();
    if (!name) return;
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    ensureRoomData(char);
    char.roomState.items.push({ name, state: '', gifted: true, acquiredAt: new Date().toISOString() });
    char.roomLogs.push({ role: 'system', text: `【グッズを贈呈: ${name}】`, timestamp: new Date().toISOString() });
    saveData();
    input.value = '';
    renderRoomItems();
    roomLog('グッズ贈呈:', name);
}

// --- データ量チェック（AI要約→長期記憶、ユーザ確認付き） ---
async function checkDataLimits(char) {
    ensureRoomData(char);
    if (char.diary.length > 60) {
        const surplus = char.diary.length - 60;
        const oldEntries = char.diary.slice(0, surplus);
        const msg = `日記が${char.diary.length}件あります。古い${surplus}件をAIで要約して長期記憶に移しますか？\n（移行後、元の日記は削除されます）`;
        if (confirm(msg)) {
            try {
                const summaryText = oldEntries.map(d => `[${d.date}] ${d.content}`).join('\n');
                const prompt = `以下の日記を短く要約してください。要約のテキストのみ出力してください。\n\n${summaryText}`;
                const summary = await callRoomAPI(prompt, '要約してください');
                const period = `${oldEntries[0].date} 〜 ${oldEntries[oldEntries.length - 1].date}`;
                char.roomLongTermMemory.push({ period, summary, createdAt: new Date().toISOString() });
                char.diary = char.diary.slice(surplus);
                saveData();
                roomLog('日記要約→長期記憶移行完了:', period);
            } catch (e) {
                roomLog('日記要約失敗:', e.message);
                alert('日記の要約中にエラーが発生しました: ' + e.message);
            }
        }
    }
}

// --- 描画関数群 ---
function renderRoomDiary() {
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    ensureRoomData(char);

    // 長期記憶
    const ltmArea = document.getElementById('room-long-term-memory-area');
    ltmArea.innerHTML = '';
    if (char.roomLongTermMemory.length > 0) {
        const section = document.createElement('div');
        section.className = 'room-long-term-section';
        section.innerHTML = '<h3>📚 長期記憶（過去の要約）</h3>';
        char.roomLongTermMemory.forEach(m => {
            const div = document.createElement('div');
            div.className = 'room-long-term-entry';
            div.textContent = `[${escapeHtml(m.period)}] ${escapeHtml(m.summary)}`;
            section.appendChild(div);
        });
        ltmArea.appendChild(section);
    }

    // 日記
    const listDiv = document.getElementById('room-diary-list');
    listDiv.innerHTML = '';
    if (char.diary.length === 0) {
        listDiv.innerHTML = '<div class="room-empty-msg">まだ日記はありません。</div>';
        return;
    }
    [...char.diary].reverse().forEach(d => {
        const entry = document.createElement('div');
        entry.className = 'room-diary-entry';
        entry.innerHTML = `<div class="room-entry-date">${escapeHtml(d.date)}</div><div class="room-entry-content">${escapeHtml(d.content)}</div>`;
        listDiv.appendChild(entry);
    });
}

function renderRoomSchedule() {
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    ensureRoomData(char);
    const div = document.getElementById('room-schedule-content');
    div.innerHTML = '';
    if (!char.roomState.schedule) {
        div.innerHTML = '<div class="room-empty-msg">スケジュールはまだ生成されていません。</div>';
        return;
    }
    const s = char.roomState.schedule;
    const items = [
        { time: s.wake_up || '-', label: '起床' },
        { time: '', label: s.morning || '-', prefix: '午前' },
        { time: '', label: s.noon || '-', prefix: '昼' },
        { time: '', label: s.evening || '-', prefix: '夕方' },
        { time: '', label: s.night || '-', prefix: '夜' },
        { time: s.bath_time || '-', label: 'お風呂', prefix: '入浴' },
        { time: '', label: s.late_night || '-', prefix: '深夜' },
        { time: s.bed_time || '-', label: '就寝' }
    ].filter(item => item.time !== '-' && item.label !== '-');
    
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'room-schedule-item';
        const timeSpan = document.createElement('span');
        timeSpan.className = 'room-schedule-time';
        timeSpan.textContent = item.prefix ? (item.time ? `${item.prefix} (${item.time})` : item.prefix) : item.time;
        const actSpan = document.createElement('span');
        actSpan.className = 'room-schedule-activity';
        actSpan.textContent = item.label;
        row.appendChild(timeSpan);
        row.appendChild(actSpan);
        div.appendChild(row);
    });
}

function renderRoomItems() {
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    ensureRoomData(char);
    const div = document.getElementById('room-items-list');
    div.innerHTML = '';
    if (char.roomState.items.length === 0) {
        div.innerHTML = '<div class="room-empty-msg">グッズはありません。</div>';
        return;
    }
    char.roomState.items.forEach(item => {
        const entry = document.createElement('div');
        entry.className = 'room-item-entry';
        
        let nameHtml = `<span class="room-item-name">${escapeHtml(item.name)}</span>`;
        if (item.gifted) {
            nameHtml += `<span class="room-item-gifted-badge">🎁 Present</span>`;
        }
        if (item.protected) {
            nameHtml += `<span class="room-item-protected-badge" style="margin-left:4px; font-size:0.75rem; background:#44c; color:#fff; padding:2px 6px; border-radius:4px;">🔒 Important</span>`;
        }
        
        let stateHtml = '';
        if (item.state) {
            stateHtml = `<div class="room-item-state">状態: ${escapeHtml(item.state)}</div>`;
        }

        entry.innerHTML = `
            <div>
                ${nameHtml}
                ${stateHtml}
            </div>
            <span class="room-item-date">${formatDate(item.acquiredAt)}</span>
        `;
        div.appendChild(entry);
    });
}

function renderRoomLogs() {
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    ensureRoomData(char);
    const div = document.getElementById('room-logs-list');
    div.innerHTML = '';
    if (char.roomLogs.length === 0) {
        div.innerHTML = '<div class="room-empty-msg">会話ログはありません。</div>';
        return;
    }
    char.roomLogs.forEach(log => {
        const entry = document.createElement('div');
        entry.className = 'room-log-entry';
        
        if (log.isSummary) {
            entry.style.backgroundColor = 'rgba(255, 200, 0, 0.1)';
            entry.style.borderLeft = '3px solid #ffcc00';
            entry.innerHTML = `<div class="room-log-role" style="color:#ffcc00;">[要約] システム (${formatDate(log.timestamp)})</div><div class="room-entry-content" style="white-space:pre-wrap; font-size:0.85rem; line-height:1.4;">${escapeHtml(log.text)}</div>`;
        } else if (log.role === 'system') {
            entry.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
            entry.innerHTML = `<div class="room-log-role" style="color:#aaa;">システム (${formatDate(log.timestamp)})</div><div class="room-entry-content" style="color:#ddd; font-size:0.85rem;">${escapeHtml(log.text)}</div>`;
        } else {
            const roleClass = log.role === 'user' ? 'room-log-role-user' : 'room-log-role-char';
            const roleName = log.role === 'user' ? 'ユーザ' : char.name;
            entry.innerHTML = `<div class="room-log-role ${roleClass}">${escapeHtml(roleName)} (${formatDate(log.timestamp)})</div><div class="room-entry-content">${escapeHtml(log.text)}</div>`;
        }
        div.appendChild(entry);
    });

    // Auto-scroll to bottom of the modal content area
    const contentArea = div.closest('.content-area');
    if (contentArea) {
        // Use setTimeout to ensure DOM updates before scrolling
        setTimeout(() => {
            contentArea.scrollTop = contentArea.scrollHeight;
        }, 10);
    }
}

// --- Room設定の読込・保存・Cropperイベント ---
let currentCropKey = null;
let cropperInstance = null;

function loadRoomSettingsForm() {
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    ensureRoomData(char);

    // IndexedDBからプレビューを非同期で読み込む
    const loadPreview = async (key, elementId) => {
        const url = await loadImageFromDB(`${char.id}_${key}`);
        const preview = document.getElementById(elementId);
        const slot = preview.parentElement;
        if (url) {
            preview.style.backgroundImage = `url('${url}')`;
            slot.classList.add('has-image');
            slot.querySelector('.room-img-delete-btn').style.display = 'flex';
        } else {
            preview.style.backgroundImage = '';
            slot.classList.remove('has-image');
            slot.querySelector('.room-img-delete-btn').style.display = 'none';
        }
    };

    const keys = ['bgMorning', 'bgEvening', 'bgNight', 'charNormal', 'charHappy', 'charAngry', 'charSad', 'charSleepy', 'charShy', 'charTroubled'];
    keys.forEach(k => loadPreview(k, `preview-${k}`));
}

function saveRoomSettingsForm() {
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    // (画像はトリミング確定時にDBに即座に保存されるため、ここでは画面を閉じて更新するのみ)
    showView('room');
    updateRoomVisuals(char); 
    roomLog('Room設定モーダルを閉じました');
}

function setupRoomSettingsEvents() {
    const slots = document.querySelectorAll('.room-img-slot');
    const modal = document.getElementById('cropper-modal');
    const imgElem = document.getElementById('cropper-image');
    let currentAspect = 1;

    slots.forEach(slot => {
        const fileInput = slot.querySelector('.room-img-file-input');
        const delBtn = slot.querySelector('.room-img-delete-btn');
        const key = slot.getAttribute('data-key');

        slot.addEventListener('click', (e) => {
            if (e.target === delBtn || e.target === fileInput) return;
            fileInput.value = ''; // クリック時にリセットすることで複数回同じファイルを選択可能にする
            fileInput.click();
        });

        // バブリング防止（input本体がクリックされた場合）
        fileInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        fileInput.addEventListener('change', (e) => {
            if (!e.target.files || e.target.files.length === 0) return;
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (re) => {
                currentCropKey = key;
                currentAspect = parseFloat(slot.getAttribute('data-aspect')) || 1;
                imgElem.src = re.target.result;
                modal.style.display = 'flex';
                
                if (cropperInstance) cropperInstance.destroy();
                setTimeout(() => {
                    if (typeof Cropper !== 'undefined') {
                        cropperInstance = new Cropper(imgElem, {
                            aspectRatio: currentAspect,
                            viewMode: 1,
                            autoCropArea: 1,
                            background: false
                        });
                    } else {
                        alert('Cropper.jsが読み込まれていません。ネットワーク状況を確認してください。');
                        modal.style.display = 'none';
                    }
                }, 100);
            };
            reader.onerror = () => {
                alert('画像の読み込みに失敗しました。');
            };
            reader.readAsDataURL(file);
            // ※ここで e.target.value = '' を実行すると、Chrome等でファイルの読み込みが中止されるため削除
        });

        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if(!confirm('本当にこの画像を削除しますか？')) return;
            const charId = AppState.activeCharId;
            await deleteImageFromDB(`${charId}_${key}`);
            const preview = document.getElementById(`preview-${key}`);
            preview.style.backgroundImage = '';
            slot.classList.remove('has-image');
            delBtn.style.display = 'none';
            roomLog('画像削除完了:', key);
        });
    });

    document.getElementById('btn-cancel-crop').addEventListener('click', () => {
        modal.style.display = 'none';
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = null;
        currentCropKey = null;
    });

    document.getElementById('btn-confirm-crop').addEventListener('click', async () => {
        if (!cropperInstance || !currentCropKey) return;
        const canvas = cropperInstance.getCroppedCanvas();
        if (!canvas) {
            alert('画像のトリミングに失敗しました。');
            return;
        }

        try {
            // 透過維持のため PNG 形式の Base64(DataURL) を生成
//            const base64Str = canvas.toDataURL('image/png');
//            const res = await fetch(base64Str);
//            const blob = await res.blob();

				const blob = await new Promise(resolve => 
				    canvas.toBlob(resolve, 'image/png')
				);
				if (!blob) {
				    alert('画像のトリミングに失敗しました。');
				    return;
				}
            
            const charId = AppState.activeCharId;
            await saveImageToDB(`${charId}_${currentCropKey}`, blob);

            // プレビューに反映
            const preview = document.getElementById(`preview-${currentCropKey}`);
            const slot = preview.parentElement;
            
            // 以前のObjectURLがあれば破棄するべきだが、ここは簡易的に上書き
            const url = URL.createObjectURL(blob);
            preview.style.backgroundImage = `url('${url}')`;
            slot.classList.add('has-image');
            slot.querySelector('.room-img-delete-btn').style.display = 'flex';

            modal.style.display = 'none';
            cropperInstance.destroy();
            cropperInstance = null;
            
            roomLog('画像トリミング・DB保存完了:', currentCropKey);
        } catch(e) {
            roomLog('画像保存エラー:', e.message);
            alert('画像の保存に失敗しました。');
        }
    });
}

// ============================================================
// 11. INITIALIZATION
// ============================================================
async function init() {
    await requestPersistentStorage();
    await loadData();
    renderCharacters();
    setupEventListeners();
    showView('main');
}

window.onload = init;
