/**
 * Antigravity Chat App - app.js
 * 全面レビュー・修正版 v2
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
// 2. LOCAL STORAGE
// ============================================================
function loadData() {
    try {
        const raw = localStorage.getItem('chatApp_data');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        AppState.apiKey = parsed.apiKey || '';
        AppState.model = parsed.model || 'gemini-3.1-flash-lite-preview';
        AppState.roomModel = parsed.roomModel || 'gemini-3.1-flash-lite-preview';
        AppState.characters = Array.isArray(parsed.characters) ? parsed.characters : [];
        AppState.threads = Array.isArray(parsed.threads) ? parsed.threads : [];
        AppState.memories = Array.isArray(parsed.memories) ? parsed.memories : [];
    } catch (e) {
        console.error('データの読み込みに失敗しました:', e);
    }
}

function saveData() {
    try {
        const dataToSave = {
            apiKey: AppState.apiKey,
            model: AppState.model,
            roomModel: AppState.roomModel,
            characters: AppState.characters,
            threads: AppState.threads,
            memories: AppState.memories
        };
        localStorage.setItem('chatApp_data', JSON.stringify(dataToSave));
    } catch (e) {
        console.error('データの保存に失敗しました:', e);
        alert('データの保存に失敗しました。ストレージ容量をご確認ください。');
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

function showView(viewName) {
    if (!views[viewName]) {
        console.error('不明なビュー名:', viewName);
        return;
    }
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

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
            renderChat();
            showView('chat');
        };

        list.appendChild(li);
    });
}

/**
 * チャット画面の描画
 */
function renderChat() {
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

    requestAnimationFrame(() => {
        historyDiv.scrollTop = historyDiv.scrollHeight;
    });
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
    document.getElementById('btn-close-global-settings').onclick = () => showView('main');

    document.getElementById('btn-back-to-chars').onclick = () => {
        AppState.activeCharId = null;
        AppState.activeThreadId = null;
        renderCharacters(); // [バグ修正] メイン画面に戻る際にキャラ一覧を再描画してスレッド数を更新
        showView('main');
    };

    document.getElementById('btn-back-to-threads').onclick = () => {
        AppState.activeThreadId = null;
        renderThreads();
        showView('thread');
    };

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
        if (AppState.activeCharId) showView('thread');
        else showView('main');
    };

    const btnCloseMemory = document.getElementById('btn-close-char-memory');
    if (btnCloseMemory) {
        btnCloseMemory.onclick = () => showView('thread');
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
        showView('charSettings');
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
        renderChat();
        renderCharacters(); // [バグ修正] スレッド作成時にキャラ一覧のスレッド数を更新
        showView('chat');
    };

    // --- Chat ---
    document.getElementById('btn-send').onclick = handleSendMessage;
    // Enterキーは改行のみ（送信は送信ボタンのみ）

    // --- Global Settings ---
    document.getElementById('api-key-input').value = AppState.apiKey;
    const radios = document.getElementsByName('model');
    for (let i = 0; i < radios.length; i++) {
        radios[i].checked = (radios[i].value === AppState.model);
    }
    const roomModelRadios = document.getElementsByName('roomModel');
    for (let i = 0; i < roomModelRadios.length; i++) {
        roomModelRadios[i].checked = (roomModelRadios[i].value === AppState.roomModel);
    }

    document.getElementById('btn-save-global').onclick = () => {
        AppState.apiKey = document.getElementById('api-key-input').value.trim();
        const radios = document.getElementsByName('model');
        for (let i = 0; i < radios.length; i++) {
            if (radios[i].checked) {
                AppState.model = radios[i].value;
                break;
            }
        }
        const roomRadios = document.getElementsByName('roomModel');
        for (let i = 0; i < roomRadios.length; i++) {
            if (roomRadios[i].checked) {
                AppState.roomModel = roomRadios[i].value;
                break;
            }
        }
        saveData();
        showView('main');
    };

    // --- Export ---
    document.getElementById('btn-export-chat').onclick = exportCurrentThread;
    document.getElementById('btn-export-all').onclick = exportAllThreadsZip;

    // --- Room ---
    document.getElementById('btn-open-room').onclick = () => {
        if (!AppState.activeCharId) return;
        enterRoom(AppState.activeCharId);
    };
    document.getElementById('btn-back-from-room').onclick = () => {
        showView('thread');
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
    document.getElementById('btn-close-room-diary').onclick = () => showView('room');
    document.getElementById('btn-close-room-schedule').onclick = () => showView('room');
    document.getElementById('btn-close-room-items').onclick = () => showView('room');
    document.getElementById('btn-close-room-logs').onclick = () => showView('room');
    document.getElementById('btn-close-room-settings-modal').onclick = () => showView('room');
    // Room Settings save
    document.getElementById('btn-save-room-settings').onclick = saveRoomSettingsForm;
    // Room Gift
    document.getElementById('btn-room-gift').onclick = handleRoomGift;
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
    renderChat();

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
        inputEl.focus();

        renderChat();
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

/** キャラクターのRoom関連データを遅延初期化 */
function ensureRoomData(char) {
    if (!char.roomSettings) {
        char.roomSettings = {
            bgMorning: '', bgEvening: '', bgNight: '',
            weatherSunny: '', weatherCloudy: '', weatherRainy: '', weatherSnowy: '',
            charNormal: '', charHappy: '', charAngry: '', charSad: '', charSleepy: ''
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
        happy:  { icon: '😄', text: 'ハッピー' },
        angry:  { icon: '😠', text: 'イライラ' },
        sad:    { icon: '😢', text: '悲しみ' },
        sleepy: { icon: '😴', text: '眠い' },
        normal: { icon: '😊', text: '普通' }
    };
    const m = moods[mood] || moods.normal;
    if (moodValue >= 80) m.text += ' ♪';
    else if (moodValue <= 20) m.text += ' …';
    return m;
}

/** 現在の時間帯を返す: morning / evening / night */
function getTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 5 && h < 17) return 'morning';
    if (h >= 17 && h < 20) return 'evening';
    return 'night';
}

/** Room画面のビジュアルを更新（背景・天気・キャラ画像・機嫌） */
function updateRoomVisuals(char) {
    ensureRoomData(char);
    const rs = char.roomSettings;
    const state = char.roomState;
    const bgLayer = document.getElementById('room-bg-layer');
    const weatherWin = document.getElementById('room-weather-window');
    const charLayer = document.getElementById('room-char-layer');

    // 背景
    const tod = getTimeOfDay();
    const bgMap = { morning: rs.bgMorning, evening: rs.bgEvening, night: rs.bgNight };
    const bgUrl = bgMap[tod];
    if (bgUrl) {
        bgLayer.className = 'room-layer';
        bgLayer.style.backgroundImage = `url('${bgUrl}')`;
    } else {
        bgLayer.className = 'room-layer room-bg-default';
        bgLayer.style.backgroundImage = '';
    }

    // 天気
    const weather = state.weatherCache?.weather || 'sunny';
    const weatherMap = { sunny: rs.weatherSunny, cloudy: rs.weatherCloudy, rainy: rs.weatherRainy, snowy: rs.weatherSnowy };
    const wUrl = weatherMap[weather];
    if (wUrl) {
        weatherWin.style.backgroundImage = `url('${wUrl}')`;
        weatherWin.style.display = 'block';
    } else {
        weatherWin.style.backgroundImage = '';
        weatherWin.style.display = 'none';
    }

    // キャラクター
    const mood = state.mood || 'normal';
    const charMap = { normal: rs.charNormal, happy: rs.charHappy, angry: rs.charAngry, sad: rs.charSad, sleepy: rs.charSleepy };
    const cUrl = charMap[mood];
    if (cUrl) {
        charLayer.style.backgroundImage = `url('${cUrl}')`;
    } else {
        charLayer.style.backgroundImage = '';
    }

    // 機嫌表示
    const md = getMoodDisplay(mood, state.moodValue);
    document.getElementById('room-mood-icon').textContent = md.icon;
    document.getElementById('room-mood-text').textContent = md.text;
}

// --- 天気取得 ---
async function fetchWeather(char) {
    ensureRoomData(char);
    const today = new Date().toISOString().slice(0, 10);
    if (char.roomState.weatherCache && char.roomState.weatherCache.date === today) {
        roomLog('天気キャッシュ使用:', char.roomState.weatherCache.weather);
        return char.roomState.weatherCache.weather;
    }
    try {
        const pos = await new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('Geolocation非対応'));
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });
        const lat = pos.coords.latitude.toFixed(2);
        const lon = pos.coords.longitude.toFixed(2);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
        const resp = await fetchWithTimeout(url, {}, 15000);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const code = data?.current_weather?.weathercode ?? 0;
        let weather = 'sunny';
        if ([1, 2, 3, 45, 48].includes(code)) weather = 'cloudy';
        else if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) weather = 'rainy';
        else if ([71, 73, 75, 77, 85, 86].includes(code)) weather = 'snowy';
        char.roomState.weatherCache = { date: today, weather };
        saveData();
        roomLog('天気取得成功:', weather, '(code:', code, ')');
        return weather;
    } catch (e) {
        roomLog('天気取得失敗（デフォルト: sunny）:', e.message);
        char.roomState.weatherCache = { date: today, weather: 'sunny' };
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
        // JSON部分を抽出（```json ... ``` のマークダウンブロック対応）
        let jsonStr = text;
        const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (mdMatch) jsonStr = mdMatch[1].trim();
        // 直接JSONオブジェクトを探す
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
            lostItems: Array.isArray(parsed.lost_items) ? parsed.lost_items : []
        };
    } catch (e) {
        roomLog('JSONパース失敗、テキストで返却:', e.message);
        return { message: text, mood: 'normal', moodValue: 50, gainedItems: [], lostItems: [] };
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
    const itemNames = char.roomState.items.map(i => i.name).join(', ') || 'なし';
    ctx += `所持グッズ: ${itemNames}\n`;

    // スケジュール
    if (char.roomState.schedule) {
        const s = char.roomState.schedule;
        ctx += '\n【本日のスケジュール】\n';
        ctx += `起床: ${s.wake_up || '?'}\n午前: ${s.morning || '?'}\n昼: ${s.noon || '?'}\n`;
        ctx += `夕方: ${s.evening || '?'}\n夜: ${s.night || '?'}\n深夜: ${s.late_night || '?'}\n就寝: ${s.bed_time || '?'}\n`;
    }

    // room会話ログ（直近30件）
    const recentLogs = char.roomLogs.slice(-30);
    if (recentLogs.length > 0) {
        ctx += '\n【最近のRoomでの会話 (直近30件)】\n';
        recentLogs.forEach(l => {
            const role = l.role === 'user' ? 'ユーザ' : char.name;
            ctx += `[${role} ${formatDate(l.timestamp)}] ${l.text}\n`;
        });
    }

    // 日記（直近30件）
    const recentDiary = char.diary.slice(-30);
    if (recentDiary.length > 0) {
        ctx += '\n【最近の日記 (直近30件)】\n';
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
    const recent30 = allMsgs.slice(-30);
    if (recent30.length > 0) {
        ctx += '\n【通常会話スレッドの直近30件の会話】\n';
        recent30.forEach(m => {
            const role = m.role === 'user' ? 'ユーザ' : char.name;
            ctx += `[${role} ${formatDate(m.timestamp)}] ${m.text.substring(0, 200)}\n`;
        });
    }

    // アクセス履歴
    const recentAccess = char.roomState.accessHistory.slice(-20);
    if (recentAccess.length > 0) {
        ctx += '\n【Roomへのアクセス履歴】\n';
        recentAccess.forEach(a => { ctx += `${formatDate(a.time)}\n`; });
    }

    // 端末情報
    const contextSettings = char.contextSettings || null;
    if (contextSettings) {
        const ctxStr = await buildContextString(contextSettings);
        if (ctxStr) ctx += '\n\n' + ctxStr;
    }

    // 返答ルール
    ctx += `\n\n【返答ルール】
あなたはRoomを訪れたユーザに対して、キャラクターとして自然に話しかけてください。枠に入る程度の一言〜二言で返してください。
必ず以下のJSON形式のみで返答してください。JSON以外のテキストは出力しないでください。
{"message": "あなたの発言テキスト", "mood": "normal", "mood_value": 50, "gained_items": [], "lost_items": []}
- message: ユーザへの発言
- mood: 現在の気分 (normal/happy/angry/sad/sleepy のいずれか)
- mood_value: 機嫌値 0-100 (0=最悪, 50=普通, 100=最高)
- gained_items: 新たに手に入れたグッズの名前の配列（なければ空配列） ※現実的な範囲のもの
- lost_items: 手放したグッズの名前の配列（なければ空配列）`;

    return ctx;
}

/** 機嫌・グッズを更新 */
function applyRoomResponse(char, parsed) {
    char.roomState.mood = parsed.mood;
    char.roomState.moodValue = parsed.moodValue;
    // グッズ追加
    parsed.gainedItems.forEach(name => {
        if (name && !char.roomState.items.find(i => i.name === name)) {
            char.roomState.items.push({ name, acquiredAt: new Date().toISOString() });
            roomLog('グッズ追加:', name);
        }
    });
    // グッズ削除
    parsed.lostItems.forEach(name => {
        const idx = char.roomState.items.findIndex(i => i.name === name);
        if (idx >= 0) {
            char.roomState.items.splice(idx, 1);
            roomLog('グッズ削除:', name);
        }
    });
    saveData();
    updateRoomVisuals(char);
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
    const prompt = (char.prompt || '') + `\n\n【指示】あなたは今日一日のスケジュールを決めます。あなたの性格や好みに合った、自然で現実的なスケジュールを決めてください。
必ず以下のJSON形式のみで返答してください:
{"wake_up": "7:00", "morning": "活動内容", "noon": "活動内容", "evening": "活動内容", "night": "活動内容", "late_night": "活動内容", "bed_time": "23:00"}`;
    const userMsg = `今日の日付: ${new Date().toLocaleDateString('ja-JP')}、天気: ${char.roomState.weatherCache?.weather || 'sunny'}`;
    try {
        const raw = await callRoomAPI(prompt, userMsg);
        let schedule;
        try {
            schedule = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
        } catch { schedule = { wake_up: '7:00', morning: '自由時間', noon: '昼食', evening: '散歩', night: 'リラックス', late_night: '就寝準備', bed_time: '23:00' }; }
        char.roomState.schedule = schedule;
        char.roomState.scheduleDate = new Date().toISOString().slice(0, 10);
        saveData();
        roomLog('スケジュール生成完了:', JSON.stringify(schedule));
    } catch (e) {
        roomLog('スケジュール生成失敗:', e.message);
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
    showView('room');
    updateRoomVisuals(char);

    try {
        // 天気取得
        await fetchWeather(char);

        // 朝5時跨ぎチェック → 日記＆スケジュール生成
        if (hasCrossed5am(char.roomState.lastAccessTime)) {
            roomLog('朝5時を跨ぎました。日記とスケジュールを生成します。');
            if (char.roomState.lastAccessTime) {
                await generateDiary(char);
            }
            await generateSchedule(char);
        }

        // アクセス記録
        char.roomState.accessHistory.push({ time: new Date().toISOString() });
        if (char.roomState.accessHistory.length > 50) {
            char.roomState.accessHistory = char.roomState.accessHistory.slice(-50);
        }
        char.roomState.lastAccessTime = new Date().toISOString();
        saveData();

        updateRoomVisuals(char);

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
        if (char.roomLogs.length > 30) char.roomLogs = char.roomLogs.slice(-30);

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
    if (char.roomLogs.length > 30) char.roomLogs = char.roomLogs.slice(-30);
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
        if (char.roomLogs.length > 30) char.roomLogs = char.roomLogs.slice(-30);

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
        input.focus();
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
    char.roomState.items.push({ name, acquiredAt: new Date().toISOString() });
    char.roomLogs.push({ role: 'user', text: `【グッズを贈呈: ${name}】`, timestamp: new Date().toISOString() });
    if (char.roomLogs.length > 30) char.roomLogs = char.roomLogs.slice(-30);
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
        { time: '', label: s.late_night || '-', prefix: '深夜' },
        { time: s.bed_time || '-', label: '就寝' }
    ];
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'room-schedule-item';
        const timeSpan = document.createElement('span');
        timeSpan.className = 'room-schedule-time';
        timeSpan.textContent = item.prefix ? item.prefix : item.time;
        const actSpan = document.createElement('span');
        actSpan.className = 'room-schedule-activity';
        actSpan.textContent = item.prefix ? item.label : item.label;
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
        entry.innerHTML = `<span class="room-item-name">${escapeHtml(item.name)}</span><span class="room-item-date">${formatDate(item.acquiredAt)}</span>`;
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
        const roleClass = log.role === 'user' ? 'room-log-role-user' : 'room-log-role-char';
        const roleName = log.role === 'user' ? 'ユーザ' : char.name;
        entry.innerHTML = `<div class="room-log-role ${roleClass}">${escapeHtml(roleName)} (${formatDate(log.timestamp)})</div><div class="room-entry-content">${escapeHtml(log.text)}</div>`;
        div.appendChild(entry);
    });
}

// --- Room設定の読込・保存 ---
function loadRoomSettingsForm() {
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    ensureRoomData(char);
    const rs = char.roomSettings;
    document.getElementById('room-img-bg-morning').value = rs.bgMorning || '';
    document.getElementById('room-img-bg-evening').value = rs.bgEvening || '';
    document.getElementById('room-img-bg-night').value = rs.bgNight || '';
    document.getElementById('room-img-weather-sunny').value = rs.weatherSunny || '';
    document.getElementById('room-img-weather-cloudy').value = rs.weatherCloudy || '';
    document.getElementById('room-img-weather-rainy').value = rs.weatherRainy || '';
    document.getElementById('room-img-weather-snowy').value = rs.weatherSnowy || '';
    document.getElementById('room-img-char-normal').value = rs.charNormal || '';
    document.getElementById('room-img-char-happy').value = rs.charHappy || '';
    document.getElementById('room-img-char-angry').value = rs.charAngry || '';
    document.getElementById('room-img-char-sad').value = rs.charSad || '';
    document.getElementById('room-img-char-sleepy').value = rs.charSleepy || '';
}

function saveRoomSettingsForm() {
    const char = AppState.characters.find(c => c.id === AppState.activeCharId);
    if (!char) return;
    ensureRoomData(char);
    char.roomSettings.bgMorning = document.getElementById('room-img-bg-morning').value.trim();
    char.roomSettings.bgEvening = document.getElementById('room-img-bg-evening').value.trim();
    char.roomSettings.bgNight = document.getElementById('room-img-bg-night').value.trim();
    char.roomSettings.weatherSunny = document.getElementById('room-img-weather-sunny').value.trim();
    char.roomSettings.weatherCloudy = document.getElementById('room-img-weather-cloudy').value.trim();
    char.roomSettings.weatherRainy = document.getElementById('room-img-weather-rainy').value.trim();
    char.roomSettings.weatherSnowy = document.getElementById('room-img-weather-snowy').value.trim();
    char.roomSettings.charNormal = document.getElementById('room-img-char-normal').value.trim();
    char.roomSettings.charHappy = document.getElementById('room-img-char-happy').value.trim();
    char.roomSettings.charAngry = document.getElementById('room-img-char-angry').value.trim();
    char.roomSettings.charSad = document.getElementById('room-img-char-sad').value.trim();
    char.roomSettings.charSleepy = document.getElementById('room-img-char-sleepy').value.trim();
    saveData();
    updateRoomVisuals(char);
    showView('room');
    roomLog('Room設定保存完了');
}

// ============================================================
// 11. INITIALIZATION
// ============================================================
function init() {
    loadData();
    renderCharacters();
    setupEventListeners();
    showView('main');
}

window.onload = init;
