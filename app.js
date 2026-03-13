/**
 * YouTube動画編集指示ツール - app.js
 */

// --- 定数・基本設定 ---
const STORAGE_KEYS = {
    videoUrl: 'yt-edit-tool.videoUrl',
    categories: 'yt-edit-tool.categories',
    notes: 'yt-edit-tool.notes'
};

const DEFAULT_CATEGORIES = 'カット, テロップ, BGM, SE, 画像挿入, ズーム, 強調, 色調整, 構成, テンポ';

// --- グローバル変数 ---
let player = null;
let isYouTubeApiReady = false;
let notes = [];
let categories = [];
let currentVideoId = '';

// --- DOM要素 ---
const dom = {
    urlInput: document.getElementById('youtube-url'),
    loadBtn: document.getElementById('load-video-btn'),
    urlError: document.getElementById('url-error'),
    categoryInput: document.getElementById('category-tags'),
    updateCatBtn: document.getElementById('update-categories-btn'),
    displayTimeText: document.getElementById('display-time-text'),
    displayTimeSec: document.getElementById('display-time-sec'),
    inputTime: document.getElementById('input-time'),
    cat1: document.getElementById('category1'),
    cat2: document.getElementById('category2'),
    cat3: document.getElementById('category3'),
    comment: document.getElementById('input-comment'),
    noteForm: document.getElementById('note-form'),
    clearBtn: document.getElementById('clear-input-btn'),
    notesList: document.getElementById('notes-list'),
    emptyMsg: document.getElementById('empty-message'),
    exportBtn: document.getElementById('export-csv-btn'),
    importInput: document.getElementById('import-csv-input'),
    deleteAllBtn: document.getElementById('delete-all-btn'),
    globalMessage: document.getElementById('global-message')
};

// --- 初期化処理 ---

function init() {
    loadState();
    renderCategories();
    renderNotesTable();
    setupEventListeners();
}

// YouTube API Ready 回答待ち
window.onYouTubeIframeAPIReady = function () {
    isYouTubeApiReady = true;
    console.log('YouTube API Ready');
    // 初回ロード時にURLがあれば自動読み込み
    if (dom.urlInput.value) {
        loadVideo();
    }
};

function setupEventListeners() {
    // 動画読み込み
    dom.loadBtn.addEventListener('click', loadVideo);
    dom.urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loadVideo();
    });

    // カテゴリ更新
    dom.updateCatBtn.addEventListener('click', () => {
        updateCategories(dom.categoryInput.value);
    });

    // 指示追加
    dom.noteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleAddNote();
    });

    // コメント欄のEnter操作
    dom.comment.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAddNote();
        }
    });

    // 入力クリア
    dom.clearBtn.addEventListener('click', clearForm);

    // CSVエクスポート
    dom.exportBtn.addEventListener('click', exportCsv);

    // CSVインポート
    dom.importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) importCsv(file);
        e.target.value = ''; // ファイル入力をリセット
    });

    // 全削除
    dom.deleteAllBtn.addEventListener('click', () => {
        if (confirm('全ての指示を削除してもよろしいですか？（現在の動画以外も含みます）')) {
            notes = [];
            saveState();
            renderNotesTable();
            showMessage('すべての指示を削除しました', 'success');
        }
    });
}

// --- YouTube制御 ---

function extractVideoId(url) {
    if (!url) return null;
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|watch\?v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return (match && match[1]) ? match[1] : null;
}

function loadVideo() {
    if (!isYouTubeApiReady) {
        showMessage('YouTube APIの読み込み中です。少々お待ちください。', 'info');
        return;
    }

    const url = dom.urlInput.value.trim();
    const videoId = extractVideoId(url);

    if (!videoId) {
        showError('無効なYouTube URLです。');
        return;
    }

    hideError();
    currentVideoId = videoId;
    saveState();

    if (!player) {
        // プレイヤー初期生成
        try {
            player = new YT.Player('player', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                host: 'https://www.youtube.com',
                playerVars: {
                    'origin': location.origin === 'null' ? '*' : location.origin,
                    'enablejsapi': 1,
                    'autoplay': 0
                },
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange,
                    'onError': (e) => {
                        console.error('YouTube Player Error:', e.data);
                        showError('動画の読み込みに失敗しました。');
                    }
                }
            });
        } catch (err) {
            console.error('Player creation error:', err);
            showError('プレイヤーの生成に失敗しました。ページを更新してください。');
        }
    } else {
        player.loadVideoById({ videoId: videoId });
    }

    document.getElementById('player-placeholder').classList.add('hidden');

    // 動画が変わったので一覧を再描画（フィルタがかかる）
    renderNotesTable();
}

function onPlayerReady(event) {
    console.log('Player initialized');
}

function onPlayerStateChange(event) {
    // PAUSED (2) または ENDED (0) 時に時間を取得
    if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
        const currentTime = Math.floor(player.getCurrentTime());
        updateTimeDisplay(currentTime);
    }
}

function updateTimeDisplay(sec) {
    const timeText = formatTime(sec);
    dom.displayTimeText.textContent = timeText;
    dom.displayTimeSec.textContent = sec;
    dom.inputTime.value = timeText;
}

// --- データ管理 ---

function generateNoteId() {
    // 衝突回避を強化
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function updateCategories(rawText) {
    const list = rawText.split(',')
        .map(s => s.trim())
        .filter(s => s !== '');

    // 重複削除
    categories = [...new Set(list)];
    dom.categoryInput.value = categories.join(',');

    saveState();
    renderCategories();
    showMessage('カテゴリを更新しました', 'success');
}

function renderCategories() {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '(なし)';

    const createOptions = (target) => {
        target.innerHTML = '';
        target.appendChild(emptyOption.cloneNode(true));
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            target.appendChild(opt);
        });
    };

    // 全て空選択を許可
    createOptions(dom.cat1);
    createOptions(dom.cat2);
    createOptions(dom.cat3);
}

function handleAddNote() {
    const timeText = dom.inputTime.value.trim();
    const timeSec = parseTimeToSeconds(timeText);
    const comment = dom.comment.value.trim();

    if (timeSec === null) {
        showMessage('時間の形式が正しくありません (hh:mm:ss または 秒数)', 'error');
        return;
    }

    if (!comment) {
        showMessage('コメントを入力してください', 'error');
        return;
    }

    if (!currentVideoId) {
        showMessage('まず動画を読み込んでください', 'error');
        return;
    }

    const note = {
        id: generateNoteId(),
        timeSec: timeSec,
        timeText: formatTime(timeSec),
        category1: dom.cat1.value,
        category2: dom.cat2.value,
        category3: dom.cat3.value,
        comment: comment,
        videoId: currentVideoId,
        videoUrl: dom.urlInput.value,
        createdAt: new Date().toISOString()
    };

    notes.push(note);
    saveState();
    renderNotesTable();

    // 入力クリア (コメントのみ)
    dom.comment.value = '';
    dom.comment.focus();
    showMessage('指示を追加しました', 'success');
}

function deleteNote(id) {
    notes = notes.filter(n => n.id !== id);
    saveState();
    renderNotesTable();
    showMessage('指示を削除しました', 'success');
}

function renderNotesTable() {
    // 現在の動画IDに紐づく指示のみ表示
    const filteredNotes = notes.filter(n => n.videoId === currentVideoId);

    // 既存リストのクリア
    dom.notesList.innerHTML = '';

    if (filteredNotes.length === 0) {
        dom.emptyMsg.classList.remove('hidden');
        dom.emptyMsg.textContent = currentVideoId ? 'この動画には指示がまだありません。' : '動画を読み込むと、その動画への指示を表示します。';
        return;
    }

    dom.emptyMsg.classList.add('hidden');

    // createElementベースで描画 (XSS対策)
    filteredNotes.forEach((n, index) => {
        const tr = document.createElement('tr');
        tr.addEventListener('click', () => seekToNote(n.id));

        const createTd = (text, className = '') => {
            const td = document.createElement('td');
            td.textContent = text;
            if (className) td.className = className;
            return td;
        };

        tr.appendChild(createTd(index + 1, 'col-no'));
        tr.appendChild(createTd(n.timeText, 'col-time'));
        tr.appendChild(createTd(n.category1, 'col-cat'));
        tr.appendChild(createTd(n.category2, 'col-cat'));
        tr.appendChild(createTd(n.category3, 'col-cat'));
        tr.appendChild(createTd(n.comment, 'col-comment'));

        const actionTd = document.createElement('td');
        actionTd.className = 'col-action';
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '削除';
        deleteBtn.className = 'btn btn-danger btn-sm';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('この指示を削除しますか？')) {
                deleteNote(n.id);
            }
        });
        actionTd.appendChild(deleteBtn);
        tr.appendChild(actionTd);

        dom.notesList.appendChild(tr);
    });
}

function seekToNote(id) {
    const note = notes.find(n => n.id === id);
    if (note && player && player.seekTo) {
        player.seekTo(note.timeSec, true);
        player.pauseVideo();
    } else {
        console.warn('Seek failed: player not ready or note not found');
    }
}

function clearForm() {
    dom.comment.value = '';
    dom.inputTime.value = dom.displayTimeText.textContent;
    showMessage('入力をクリアしました', 'info');
}

// --- CSV操作 ---

function exportCsv() {
    if (notes.length === 0) {
        showMessage('出力するデータがありません。', 'error');
        return;
    }

    const headers = ['timeSec', 'timeText', 'category1', 'category2', 'category3', 'comment', 'videoId', 'videoUrl'];

    let csvContent = headers.join(',') + '\n';
    notes.forEach(n => {
        const row = headers.map(h => {
            const value = n[h];
            const str = (value === null || value === undefined) ? '' : String(value);
            // エスケープ
            if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        });
        csvContent += row.join(',') + '\n';
    });

    // UTF-8 BOM
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const now = new Date();
    const ts = now.toISOString().replace(/[:T]/g, '').slice(0, 14);

    link.href = url;
    link.download = `youtube_edit_notes_${ts}.csv`;
    document.body.appendChild(link);
    link.click();

    // クリーンアップ
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);

    showMessage('CSVをダウンロードしました', 'success');
}

function importCsv(file) {
    if (!confirm('全ての既存データを上書きしてCSVを読み込みますか？')) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const text = e.target.result;
            const lines = parseCsv(text);
            if (lines.length < 2) throw new Error('データがありません');

            const headers = lines[0].map(h => h.trim());

            // 必須ヘッダの検証
            const required = ['timeSec', 'timeText', 'comment'];
            const missing = required.filter(r => !headers.includes(r));
            if (missing.length > 0) {
                throw new Error(`必須列が不足しています: ${missing.join(', ')}`);
            }

            const dataRows = lines.slice(1);
            const importedNotes = dataRows.map(row => {
                const item = {};
                headers.forEach((h, i) => {
                    item[h] = row[i];
                });

                return {
                    id: generateNoteId(),
                    timeSec: parseInt(item.timeSec) || 0,
                    timeText: item.timeText || '00:00:00',
                    category1: item.category1 || '',
                    category2: item.category2 || '',
                    category3: item.category3 || '',
                    comment: item.comment || '',
                    videoId: item.videoId || '',
                    videoUrl: item.videoUrl || '',
                    createdAt: new Date().toISOString()
                };
            });

            notes = importedNotes;

            // UX改善: インポートしたデータの動画に切り替える
            if (notes.length > 0) {
                const firstNote = notes[0];
                if (firstNote.videoUrl) {
                    dom.urlInput.value = firstNote.videoUrl;
                    loadVideo(); // これにより currentVideoId も更新され描画も走る
                } else if (firstNote.videoId) {
                    // URLがないがIDがある場合
                    currentVideoId = firstNote.videoId;
                    dom.urlInput.value = `https://www.youtube.com/watch?v=${firstNote.videoId}`;
                    loadVideo();
                }
            }

            saveState();
            renderNotesTable();
            showMessage(`${notes.length}件の指示を読み込みました`, 'success');
        } catch (err) {
            showMessage('CSVの読み込みに失敗しました: ' + err.message, 'error');
            console.error(err);
        }
    };
    reader.readAsText(file);
}

function parseCsv(text) {
    const result = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                cell += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                cell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(cell);
                cell = '';
            } else if (char === '\n' || char === '\r') {
                if (cell || row.length > 0) {
                    row.push(cell);
                    result.push(row);
                    cell = '';
                    row = [];
                }
                if (char === '\r' && nextChar === '\n') i++;
            } else {
                cell += char;
            }
        }
    }
    if (cell || row.length > 0) {
        row.push(cell);
        result.push(row);
    }
    return result;
}

// --- ユーティリティ ---

function formatTime(sec) {
    const safeSec = Math.max(0, Math.floor(sec));
    const h = Math.floor(safeSec / 3600);
    const m = Math.floor((safeSec % 3600) / 60);
    const s = safeSec % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function parseTimeToSeconds(text) {
    if (!text) return null;

    if (text.includes(':')) {
        const parts = text.split(':').map(Number);
        if (parts.some(isNaN)) return null;

        // 分・秒の範囲チェック (0-59)
        if (parts.length === 3) {
            if (parts[1] >= 60 || parts[2] >= 60) return null;
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            if (parts[1] >= 60) return null;
            return parts[0] * 60 + parts[1];
        }
    }

    const sec = Number(text);
    return (isNaN(sec) || sec < 0) ? null : Math.floor(sec);
}

function showMessage(msg, type = 'info') {
    dom.globalMessage.textContent = msg;
    dom.globalMessage.className = `message-area ${type}`;
    dom.globalMessage.classList.remove('hidden');

    // 5秒後に消す
    if (window.messageTimer) clearTimeout(window.messageTimer);
    window.messageTimer = setTimeout(() => {
        dom.globalMessage.classList.add('hidden');
    }, 5000);
}

function showError(msg) {
    dom.urlError.textContent = msg;
    dom.urlError.classList.remove('hidden');
}

function hideError() {
    dom.urlError.classList.add('hidden');
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEYS.videoUrl, dom.urlInput.value);
        localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
        localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
    } catch (e) {
        console.error('Storage save failed:', e);
    }
}

function loadState() {
    try {
        // URL
        dom.urlInput.value = localStorage.getItem(STORAGE_KEYS.videoUrl) || '';

        // Categories
        const savedCats = localStorage.getItem(STORAGE_KEYS.categories);
        if (savedCats) {
            const parsed = JSON.parse(savedCats);
            categories = Array.isArray(parsed) ? parsed : DEFAULT_CATEGORIES.split(',');
        } else {
            categories = DEFAULT_CATEGORIES.split(',');
        }
        dom.categoryInput.value = categories.join(',');

        // Notes
        const savedNotes = localStorage.getItem(STORAGE_KEYS.notes);
        if (savedNotes) {
            const parsed = JSON.parse(savedNotes);
            notes = Array.isArray(parsed) ? parsed : [];
        } else {
            notes = [];
        }

    } catch (e) {
        console.error('State load failed, resetting to defaults:', e);
        categories = DEFAULT_CATEGORIES.split(',');
        notes = [];
    }
}

// 実行
init();

