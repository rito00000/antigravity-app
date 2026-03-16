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
    characters: [], // { id, name, prompt, appearance }
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
    globalSettings: document.getElementById('global-settings-view')
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

    document.getElementById('btn-save-global').onclick = () => {
        AppState.apiKey = document.getElementById('api-key-input').value.trim();
        const radios = document.getElementsByName('model');
        for (let i = 0; i < radios.length; i++) {
            if (radios[i].checked) {
                AppState.model = radios[i].value;
                break;
            }
        }
        saveData();
        showView('main');
    };

    // --- Export ---
    document.getElementById('btn-export-chat').onclick = exportCurrentThread;
    document.getElementById('btn-export-all').onclick = exportAllThreadsZip;
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
// 10. INITIALIZATION
// ============================================================
function init() {
    loadData();
    renderCharacters();
    setupEventListeners();
    showView('main');
}

window.onload = init;
