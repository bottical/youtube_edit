/**
 * YouTube動画編集指示ツール - app.js
 */

// --- 定数・基本設定 ---
const STORAGE_KEYS = {
    videoUrl: 'yt-edit-tool.videoUrl',
    categories: 'yt-edit-tool.categories',
    notes: 'yt-edit-tool.notes'
};

const DEFAULT_CATEGORIES = 'カット,テロップ,BGM,SE,ズーム,強調,色調整,構成,テンポ,不要部分削除';

// --- グローバル変数 ---
let player;
let isPlayerReady = false;
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
    deleteAllBtn: document.getElementById('delete-all-btn')
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
    console.log('YouTube API Ready');
    // 初回ロード時にURLがあればプレイヤーを生成
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
    });

    // 全削除
    dom.deleteAllBtn.addEventListener('click', () => {
        if (confirm('全ての指示を削除してもよろしいですか？')) {
            notes = [];
            saveState();
            renderNotesTable();
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
        player = new YT.Player('player', {
            height: '100%',
            width: '100%',
            videoId: videoId,
            host: 'https://www.youtube.com', // エラー153対策
            playerVars: {
                'origin': window.location.origin === 'null' ? '*' : window.location.origin, // file:// の場合は '*'
                'enablejsapi': 1,
                'widget_referrer': window.location.href
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': (e) => console.error('YouTube Player Error:', e.data)
            }
        });
    } else {
        player.loadVideoById({
            videoId: videoId
        });
    }

    document.getElementById('player-placeholder').classList.add('hidden');
}

function onPlayerReady(event) {
    isPlayerReady = true;
    console.log('Player initialized');
}

function onPlayerStateChange(event) {
    // PAUSED (2) または ENDED (0) 時に時間を取得
    if (event.data === YT.PlayerState.PAUSED) {
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

function updateCategories(rawText) {
    const list = rawText.split(',')
        .map(s => s.trim())
        .filter(s => s !== '');

    // 重複削除
    categories = [...new Set(list)];
    dom.categoryInput.value = categories.join(',');

    saveState();
    renderCategories();
}

function renderCategories() {
    const options = categories.map(c => `<option value="${c}">${c}</option>`).join('');
    const emptyOption = '<option value="">(なし)</option>';

    dom.cat1.innerHTML = options || emptyOption;
    dom.cat2.innerHTML = emptyOption + options;
    dom.cat3.innerHTML = emptyOption + options;
}

function handleAddNote() {
    const timeText = dom.inputTime.value.trim();
    const timeSec = parseTimeToSeconds(timeText);
    const comment = dom.comment.value.trim();

    if (timeSec === null) {
        alert('時間の形式が正しくありません (hh:mm:ss または 秒数)');
        return;
    }

    if (!comment) {
        alert('コメントを入力してください');
        return;
    }

    const note = {
        id: Date.now().toString(),
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

    // 入力クリア (時間は保持、コメントのみクリアしフォーカス)
    dom.comment.value = '';
    dom.comment.focus();
}

function deleteNote(id) {
    notes = notes.filter(n => n.id !== id);
    saveState();
    renderNotesTable();
}

function renderNotesTable() {
    if (notes.length === 0) {
        dom.notesList.innerHTML = '';
        dom.emptyMsg.classList.remove('hidden');
        return;
    }

    dom.emptyMsg.classList.add('hidden');
    dom.notesList.innerHTML = notes.map((n, index) => `
        <tr onclick="seekToNote('${n.id}')">
            <td>${index + 1}</td>
            <td>${n.timeText}</td>
            <td>${n.category1}</td>
            <td>${n.category2}</td>
            <td>${n.category3}</td>
            <td>${n.comment}</td>
            <td>
                <button class="btn btn-danger" onclick="event.stopPropagation(); deleteNote('${n.id}')">削除</button>
            </td>
        </tr>
    `).join('');
}

window.seekToNote = function (id) {
    const note = notes.find(n => n.id === id);
    if (note && player && isPlayerReady) {
        player.seekTo(note.timeSec, true);
        player.pauseVideo(); // シーク後に停止状態で確認しやすくする
    } else if (!isPlayerReady) {
        alert('プレイヤーが準備できていません。動画を読み込んでください。');
    }
};

function clearForm() {
    dom.comment.value = '';
    dom.inputTime.value = dom.displayTimeText.textContent;
}

// --- CSV操作 ---

function exportCsv() {
    if (notes.length === 0) {
        alert('出力するデータがありません。');
        return;
    }

    const headers = ['timeSec', 'timeText', 'category1', 'category2', 'category3', 'comment', 'videoId', 'videoUrl'];
    const rows = notes.map(n => [
        n.timeSec,
        n.timeText,
        n.category1,
        n.category2,
        n.category3,
        n.comment,
        n.videoId,
        n.videoUrl
    ]);

    let csvContent = headers.join(',') + '\n';
    rows.forEach(row => {
        const escapedRow = row.map(value => {
            const str = (value === null || value === undefined) ? '' : String(value);
            // ダブルクォート、カンマ、改行が含まれる場合はエスケープ
            if (str.includes('"') || str.includes(',') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        });
        csvContent += escapedRow.join(',') + '\n';
    });

    // UTF-8 BOM付き
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    const now = new Date();
    const timestamp = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

    link.setAttribute('href', url);
    link.setAttribute('download', `youtube_edit_notes_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function importCsv(file) {
    if (!confirm('既存のデータを上書きしてCSVを読み込みますか？')) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const text = e.target.result;
            const lines = parseCsv(text);
            if (lines.length < 2) throw new Error('データがありません');

            const headers = lines[0];
            const dataRows = lines.slice(1);

            const importedNotes = dataRows.map(row => {
                const note = {};
                headers.forEach((header, i) => {
                    note[header.trim()] = row[i];
                });

                // 必須フィールドの補完と型変換
                return {
                    id: Date.now().toString() + Math.random(),
                    timeSec: parseInt(note.timeSec) || 0,
                    timeText: note.timeText || '00:00:00',
                    category1: note.category1 || '',
                    category2: note.category2 || '',
                    category3: note.category3 || '',
                    comment: note.comment || '',
                    videoId: note.videoId || '',
                    videoUrl: note.videoUrl || '',
                    createdAt: new Date().toISOString()
                };
            });

            notes = importedNotes;
            saveState();
            renderNotesTable();
            alert(`${notes.length}件の指示を読み込みました。`);
        } catch (err) {
            alert('CSVのパースに失敗しました。形式を確認してください。');
            console.error(err);
        }
    };
    reader.readAsText(file);
}

// 簡易CSVパース (引用符対応)
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
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function parseTimeToSeconds(text) {
    if (!text) return null;

    // hh:mm:ss または mm:ss
    if (text.includes(':')) {
        const parts = text.split(':').map(Number);
        if (parts.some(isNaN)) return null;

        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
    }

    // 単純な数値
    const sec = Number(text);
    return isNaN(sec) ? null : sec;
}

function saveState() {
    localStorage.setItem(STORAGE_KEYS.videoUrl, dom.urlInput.value);
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
}

function loadState() {
    dom.urlInput.value = localStorage.getItem(STORAGE_KEYS.videoUrl) || '';

    const savedCats = localStorage.getItem(STORAGE_KEYS.categories);
    categories = savedCats ? JSON.parse(savedCats) : DEFAULT_CATEGORIES.split(',');
    dom.categoryInput.value = categories.join(',');

    const savedNotes = localStorage.getItem(STORAGE_KEYS.notes);
    notes = savedNotes ? JSON.parse(savedNotes) : [];
}

function showError(msg) {
    dom.urlError.textContent = msg;
    dom.urlError.classList.remove('hidden');
}

function hideError() {
    dom.urlError.classList.add('hidden');
}

// 実行
init();
