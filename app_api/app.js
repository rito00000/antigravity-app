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
// 4. VIEW NAVIGATION
// ============================================================
const views = {
    main: document.getElementById('main-view'),
    thread: document.getElementById('thread-view'),
    chat: document.getElementById('chat-view'),
    charSettings: document.getElementById('char-settings-view'),
    charMemory: document.getElementById('char-memory-view'),
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
                document.getElementById('thread-header-title').textContent = name;
            }
            saveData();
            renderCharacters();
            showView('thread');
        } else {
            const newChar = { id: generateId(), name, appearance, prompt, appearancePrompt };
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
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

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

        const systemPromptText = buildSystemPrompt(char);

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
