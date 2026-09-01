import { signIn, getCurrentUid } from "./firebase-service.js";
import { joinRoom, checkRoomExists, addToQueue, removeFromQueue, sendCommand } from "./room-service.js";
import { searchYouTube } from "./youtube-search.js";
import { categories } from "./music-categories.js";
import { featuredArtists } from "./featured-artists.js";
import { db, ref, onValue } from "./firebase-service.js";
import { debounce, throttle } from "./utils.js";

// DOM Elements
const joinView = document.getElementById('join-view');
const appView = document.getElementById('app-view');
const joinForm = document.getElementById('join-form');
const loadingOverlay = document.getElementById('loading-overlay');
const toastEl = document.getElementById('toast');

// State
let roomCode = null;
let currentQueueId = null;

// Initialization
async function init() {
    const params = new URLSearchParams(window.location.search);
    roomCode = params.get("r");

    if (!roomCode) {
        showError('join-error', "Mã phòng không hợp lệ.");
        document.getElementById('join-room-name').innerText = "Lỗi";
        return;
    }
    
    // Auth
    try {
        await signIn();
        const exists = await checkRoomExists(roomCode);
        if (!exists) {
            showError('join-error', "Phòng không tồn tại hoặc đã đóng.");
            document.getElementById('join-room-name').innerText = "Lỗi";
            return;
        }
        
        // Show join form
        document.getElementById('join-room-name').innerText = `Phòng: ${roomCode}`;
        joinForm.classList.remove('hidden');
        
        document.getElementById('btn-join').addEventListener('click', handleJoin);
        
    } catch (error) {
        console.error(error);
        showError('join-error', "Lỗi kết nối.");
    }
}

async function handleJoin() {
    const nickname = document.getElementById('nickname').value.trim();
    showLoading(true);
    try {
        await joinRoom(roomCode, nickname);
        
        joinView.classList.add('hidden');
        appView.classList.remove('hidden');
        document.getElementById('header-room-name').innerText = roomCode;
        
        setupApp();
    } catch (error) {
        console.error(error);
        showError('join-error', "Không thể vào phòng.");
        showLoading(false);
    }
}

function setupApp() {
    setupTabs();
    setupSearch();
    renderDiscoverTab();
    setupControls();
    setupRealtimeListeners();
    showLoading(false);
}

function setupTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.add('hidden'));
            
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });
}

function renderDiscoverTab() {
    const categoriesGrid = document.getElementById('categories-grid');
    categories.forEach(cat => {
        const chip = document.createElement('div');
        chip.className = 'chip-card';
        if (cat.id === 'hot-tiktok') chip.classList.add('highlight');
        chip.innerText = cat.label;
        chip.addEventListener('click', () => {
            switchToTab('tab-search');
            performSearch({ categoryQuery: cat.searchQuery });
        });
        categoriesGrid.appendChild(chip);
    });
    
    const artistsScroll = document.getElementById('artists-scroll');
    featuredArtists.forEach(artist => {
        const chip = document.createElement('div');
        chip.className = 'chip-card';
        chip.innerText = artist.name;
        chip.addEventListener('click', () => {
            switchToTab('tab-search');
            performSearch({ artist: artist.name });
        });
        artistsScroll.appendChild(chip);
    });
}

function switchToTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(nav => {
        if (nav.getAttribute('data-target') === tabId) {
            nav.classList.add('active');
        } else {
            nav.classList.remove('active');
        }
    });
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.id === tabId) tab.classList.remove('hidden');
        else tab.classList.add('hidden');
    });
}

function setupSearch() {
    const btnSearch = document.getElementById('btn-search');
    const inputKeyword = document.getElementById('search-keyword');
    const inputArtist = document.getElementById('search-artist');
    
    const triggerSearch = () => {
        const keyword = inputKeyword.value;
        const artist = inputArtist.value;
        if (keyword.trim().length < 2 && artist.trim().length < 2) return;
        
        performSearch({ keyword, artist });
    };
    
    btnSearch.addEventListener('click', triggerSearch);
    
    const onEnter = (e) => {
        if (e.key === 'Enter') triggerSearch();
    };
    inputKeyword.addEventListener('keypress', onEnter);
    inputArtist.addEventListener('keypress', onEnter);
}

let lastSearchResultsHTML = '<div class="empty-state">Nhập tên bài hát hoặc ca sĩ để tìm kiếm</div>';

function showSearchStatus(msg, type = 'info') {
    const statusEl = document.getElementById('search-status');
    if (!msg) {
        statusEl.classList.add('hidden');
        return;
    }
    statusEl.innerText = msg;
    statusEl.className = `search-status ${type}`;
    statusEl.classList.remove('hidden');
}

async function performSearch(params) {
    const resultsContainer = document.getElementById('search-results');
    
    // Set UI to loading, but keep old results visible underneath the overlay/status if preferred.
    // For MVP, we will dim the results list and show loading status.
    showSearchStatus('Đang tìm kiếm...', 'loading');
    resultsContainer.style.opacity = '0.5';
    
    const response = await searchYouTube(params);
    
    if (response.aborted) {
        return; // Ignore aborted requests
    }
    
    resultsContainer.style.opacity = '1';
    
    if (response.errorMsg) {
        showSearchStatus(response.errorMsg, 'error');
        resultsContainer.innerHTML = lastSearchResultsHTML; // Restore previous good state
        return;
    }
    
    showSearchStatus(null);
    renderSearchResults(response.results);
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results');
    container.innerHTML = '';
    
    if (results.length === 0) {
        lastSearchResultsHTML = '<div class="empty-state">Không tìm thấy kết quả phù hợp.</div>';
        container.innerHTML = lastSearchResultsHTML;
        return;
    }
    
    results.forEach(video => {
        const item = document.createElement('div');
        item.className = 'video-item';
        
        const parsed = video.parsed || {};
        const titleDisplay = parsed.songName ? parsed.songName : video.title;
        
        item.innerHTML = `
            <img src="${video.thumbnailUrl}" class="video-thumb" alt="Thumbnail">
            <div class="video-info">
                <div class="video-title">${escapeHTML(titleDisplay)}</div>
                <div class="video-meta">
                    ${parsed.author ? `<span class="tag author">🎤 ${escapeHTML(parsed.author)}</span>` : ''}
                    ${parsed.tone ? `<span class="tag tone">${escapeHTML(parsed.tone.toUpperCase())}</span>` : ''}
                    <span class="tag channel">🎬 ${escapeHTML(parsed.producer || video.channelTitle)}</span>
                </div>
            </div>
            <button class="btn-add">+ THÊM</button>
        `;
        
        const btnAdd = item.querySelector('.btn-add');
        btnAdd.addEventListener('click', async () => {
            btnAdd.disabled = true;
            try {
                // Fetch user display name locally (ideally we store this on app state after join)
                const nickname = document.getElementById('nickname').value.trim() || 'Khách';
                await addToQueue(roomCode, video, nickname);
                showToast("Đã thêm vào hàng đợi");
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi thêm bài", true);
                btnAdd.disabled = false;
            }
        });
        
        container.appendChild(item);
    });
    
    lastSearchResultsHTML = container.innerHTML;
}

function setupControls() {
    const buttons = document.querySelectorAll('.btn-control');
    
    // Throttle commands to max 1 per second
    const throttledSend = throttle(async (cmdType) => {
        try {
            await sendCommand(roomCode, cmdType);
            const msgEl = document.getElementById('control-msg');
            msgEl.innerText = `Đã gửi lệnh: ${cmdType}`;
            msgEl.classList.remove('hidden');
            setTimeout(() => msgEl.classList.add('hidden'), 2000);
        } catch (err) {
            console.error("Control error:", err);
            showToast("Lỗi gửi lệnh", true);
        }
    }, 1000);

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.getAttribute('data-command');
            throttledSend(cmd);
        });
    });
}

function setupRealtimeListeners() {
    // Listen to Room Status
    const roomRef = ref(db, `rooms/${roomCode}/status`);
    onValue(roomRef, (snapshot) => {
        if (snapshot.val() === 'closed') {
            alert("Phòng đã đóng.");
            window.location.href = "./index.html";
        }
    });

    // Listen to Player State
    const playerRef = ref(db, `rooms/${roomCode}/player`);
    onValue(playerRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const statusIcon = document.getElementById('mini-status-icon');
            const statusTitle = document.getElementById('mini-status-title');
            
            if (data.state === 'playing') {
                statusIcon.innerText = '▶';
            } else if (data.state === 'paused') {
                statusIcon.innerText = '⏸';
            } else {
                statusIcon.innerText = '⏹';
            }
            
            statusTitle.innerText = data.title || 'Chưa có bài';
            currentQueueId = data.currentQueueId;
        }
    });

    // Listen to Queue
    const queueRef = ref(db, `rooms/${roomCode}/queue`);
    onValue(queueRef, (snapshot) => {
        const queueList = [];
        let nowPlaying = null;
        
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const item = { id: child.key, ...child.val() };
                if (item.status === 'playing') {
                    nowPlaying = item;
                } else if (item.status === 'waiting') {
                    queueList.push(item);
                }
            });
        }
        
        queueList.sort((a, b) => a.createdAt - b.createdAt);
        renderQueue(nowPlaying, queueList);
    });
}

function renderQueue(nowPlaying, queueList) {
    const npContainer = document.getElementById('now-playing-item');
    if (nowPlaying) {
        npContainer.innerHTML = `
            <div class="queue-info">
                <div class="title">${escapeHTML(nowPlaying.title)}</div>
                <div class="adder">Người thêm: ${escapeHTML(nowPlaying.addedByName)}</div>
            </div>
        `;
    } else {
        npContainer.innerHTML = '<div class="empty-state">Chưa có bài đang phát</div>';
    }

    const qContainer = document.getElementById('queue-list');
    qContainer.innerHTML = '';
    
    if (queueList.length === 0) {
        qContainer.innerHTML = '<div class="empty-state">Hàng đợi trống</div>';
        return;
    }
    
    const uid = getCurrentUid();
    
    queueList.forEach((item, index) => {
        const el = document.createElement('div');
        el.className = 'queue-item';
        el.innerHTML = `
            <div class="queue-info">
                <div class="title">${index + 1}. ${escapeHTML(item.title)}</div>
                <div class="adder">${escapeHTML(item.addedByName)}</div>
            </div>
            ${item.addedByUid === uid ? `<button class="btn-remove" data-id="${item.id}">×</button>` : ''}
        `;
        
        const btnRemove = el.querySelector('.btn-remove');
        if (btnRemove) {
            btnRemove.addEventListener('click', async () => {
                if (confirm("Xóa bài này khỏi hàng đợi?")) {
                    try {
                        await removeFromQueue(roomCode, item.id);
                    } catch (err) {
                        console.error(err);
                        showToast("Lỗi khi xóa", true);
                    }
                }
            });
        }
        
        qContainer.appendChild(el);
    });
}

function showLoading(show) {
    loadingOverlay.classList.toggle('hidden', !show);
}

function showError(elId, msg) {
    const el = document.getElementById(elId);
    el.innerText = msg;
    el.classList.remove('hidden');
}

function showToast(msg, isError = false) {
    toastEl.innerText = msg;
    toastEl.style.background = isError ? 'var(--error-color)' : 'white';
    toastEl.style.color = isError ? 'white' : 'black';
    toastEl.classList.remove('hidden');
    
    setTimeout(() => {
        toastEl.classList.add('hidden');
    }, 3000);
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

init();
