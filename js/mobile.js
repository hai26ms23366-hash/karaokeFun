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

const MAX_SEARCH_RESULTS = 30;
let discoverScrollPos = 0;
let currentSearchState = {
    params: null,
    nextPageToken: null,
    resultCount: 0,
    loading: false,
    displayedIds: new Set(),
    allResults: []
};
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
            const currentActive = document.querySelector('.nav-item.active');
            const targetId = item.getAttribute('data-target');
            
            // Save scroll pos if leaving discover
            if (currentActive && currentActive.getAttribute('data-target') === 'tab-discover') {
                discoverScrollPos = document.querySelector('.content-area').scrollTop;
            }
            
            navItems.forEach(nav => nav.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.add('hidden'));
            
            item.classList.add('active');
            document.getElementById(targetId).classList.remove('hidden');
            
            // Restore scroll pos if returning to discover
            if (targetId === 'tab-discover') {
                document.querySelector('.content-area').scrollTop = discoverScrollPos;
            }
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
            performSearch({ categoryQuery: cat.searchQuery, _label: cat.label, _type: 'category' });
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
            performSearch({ artist: artist.name, _type: 'artist' });
        });
        artistsScroll.appendChild(chip);
    });
}

function switchToTab(tabId) {
    const currentActive = document.querySelector('.nav-item.active');
    if (currentActive && currentActive.getAttribute('data-target') === 'tab-discover') {
        discoverScrollPos = document.querySelector('.content-area').scrollTop;
    }
    
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
    
    if (tabId === 'tab-search') {
        document.querySelector('.content-area').scrollTop = 0;
    } else if (tabId === 'tab-discover') {
        document.querySelector('.content-area').scrollTop = discoverScrollPos;
    }
}

function setupSearch() {
    const btnSearch = document.getElementById('btn-search');
    const inputKeyword = document.getElementById('search-keyword');
    const inputArtist = document.getElementById('search-artist');
    
    const triggerSearch = () => {
        const keyword = inputKeyword.value;
        const artist = inputArtist.value;
        if (keyword.trim().length < 2 && artist.trim().length < 2) return;
        
        // Remove focus to dismiss keyboard on mobile
        inputKeyword.blur();
        inputArtist.blur();
        
        let _type = 'song';
        if (keyword && artist) _type = 'combined';
        else if (artist) _type = 'artist';
        
        performSearch({ keyword, artist, _type });
    };
    
    btnSearch.addEventListener('click', triggerSearch);
    
    const onEnter = (e) => {
        if (e.key === 'Enter') triggerSearch();
    };
    inputKeyword.addEventListener('keypress', onEnter);
    inputArtist.addEventListener('keypress', onEnter);
    
    document.getElementById('btn-load-more').addEventListener('click', () => {
        if (currentSearchState.params && currentSearchState.nextPageToken) {
            performSearch(currentSearchState.params, true);
        }
    });
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

async function performSearch(params, isLoadMore = false) {
    if (currentSearchState.loading) return;
    
    const resultsContainer = document.getElementById('search-results');
    const loadMoreBtn = document.getElementById('btn-load-more');
    const searchHeader = document.getElementById('search-header-text');
    
    // Update header context only on new search
    if (!isLoadMore) {
        document.getElementById('search-header').classList.remove('hidden');
        if (params._type === 'category') {
            searchHeader.innerText = params.categoryQuery === 'nhạc hot tiktok karaoke' ? 'Khám phá: Hot TikTok' : `Thể loại: ${params._label}`;
        } else if (params._type === 'artist') {
            searchHeader.innerText = `Ca sĩ: ${params.artist}`;
        } else if (params._type === 'combined') {
            searchHeader.innerHTML = `Kết quả cho: <strong>${escapeHTML(params.keyword)}</strong><br>Ca sĩ: ${escapeHTML(params.artist)}`;
        } else {
            searchHeader.innerHTML = `Kết quả cho: <strong>${escapeHTML(params.keyword)}</strong>`;
        }
        
        // Reset state for new search
        currentSearchState = {
            params: params,
            nextPageToken: null,
            resultCount: 0,
            loading: true,
            displayedIds: new Set(),
            allResults: []
        };
        showSearchStatus('Đang tìm kiếm...', 'loading');
        resultsContainer.style.opacity = '0.5';
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
    } else {
        currentSearchState.loading = true;
        if (loadMoreBtn) loadMoreBtn.innerText = 'ĐANG TẢI...';
    }
    
    const pageTokenToUse = isLoadMore ? currentSearchState.nextPageToken : "";
    const response = await searchYouTube(currentSearchState.params, pageTokenToUse);
    
    console.log("PAGINATION DEBUG", {
        resultLength: response.results?.length,
        nextPageToken: response.nextPageToken,
        isLoadMore,
        query: response.query
    });
    
    currentSearchState.loading = false;
    
    if (response.aborted) {
        return; // Ignore aborted requests
    }
    
    resultsContainer.style.opacity = '1';
    
    if (response.errorMsg) {
        if (!isLoadMore) {
            showSearchStatus(response.errorMsg, 'error');
            resultsContainer.innerHTML = lastSearchResultsHTML;
        } else {
            if (loadMoreBtn) {
                loadMoreBtn.innerText = 'THỬ LẠI';
                loadMoreBtn.classList.remove('hidden');
            }
            showToast(response.errorMsg, true);
        }
        return;
    }
    
    showSearchStatus(null);
    currentSearchState.nextPageToken = response.nextPageToken;
    renderSearchResults(response.results, isLoadMore);
}

function renderSearchResults(results, append = false) {
    const container = document.getElementById('search-results');
    const loadMoreBtn = document.getElementById('btn-load-more');
    
    if (!append) {
        currentSearchState.resultCount = 0;
        currentSearchState.displayedIds.clear();
        currentSearchState.allResults = [];
    }
    
    results.forEach(video => {
        if (currentSearchState.displayedIds.has(video.id)) return; // Deduplicate
        currentSearchState.displayedIds.add(video.id);
        
        video.originalIndex = currentSearchState.allResults.length;
        currentSearchState.allResults.push(video);
    });
    
    currentSearchState.resultCount = currentSearchState.allResults.length;
    
    if (currentSearchState.resultCount === 0) {
        lastSearchResultsHTML = '<div class="empty-state">Không tìm thấy kết quả phù hợp.</div>';
        container.innerHTML = lastSearchResultsHTML;
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
        return;
    }
    
    // Sort allResults by transparency score DESC, then originalIndex ASC
    const sortedResults = [...currentSearchState.allResults].sort((a, b) => {
        const scoreA = a.copyright ? a.copyright.score : 0;
        const scoreB = b.copyright ? b.copyright.score : 0;
        if (scoreB !== scoreA) {
            return scoreB - scoreA;
        }
        return a.originalIndex - b.originalIndex;
    });
    
    container.innerHTML = '';
    
    sortedResults.forEach(video => {
        const item = document.createElement('div');
        item.className = 'video-item';
        
        const parsed = video.parsed || {};
        const titleDisplay = parsed.songName ? parsed.songName : video.title;
        
        let transHtml = '';
        if (video.copyright) {
            if (video.copyright.fetchFailed) {
                transHtml = `<div class="transparency-line error">🛡 Thông tin bản quyền chưa khả dụng</div>`;
            } else {
                transHtml = `
                    <div class="transparency-line">
                        🛡 Copyright check: ${video.copyright.score}% • ${video.copyright.level}
                        <button class="btn-transparency-details" data-id="${video.id}">[ Xem chi tiết ]</button>
                    </div>
                `;
            }
        }
        
        item.innerHTML = `
            <img src="${video.thumbnailUrl}" class="video-thumb" alt="Thumbnail">
            <div class="video-info">
                <div class="video-title">${escapeHTML(titleDisplay)}</div>
                <div class="video-meta">
                    ${parsed.author ? `<span class="tag author">🎤 ${escapeHTML(parsed.author)}</span>` : ''}
                    ${parsed.tone ? `<span class="tag tone">${escapeHTML(parsed.tone.toUpperCase())}</span>` : ''}
                    <span class="tag channel">🎬 ${escapeHTML(parsed.producer || video.channelTitle)}</span>
                </div>
                ${transHtml}
            </div>
            <button class="btn-add">+ THÊM</button>
        `;
        
        const btnAdd = item.querySelector('.btn-add');
        btnAdd.addEventListener('click', async () => {
            btnAdd.disabled = true;
            try {
                const nickname = document.getElementById('nickname').value.trim() || 'Khách';
                await addToQueue(roomCode, video, nickname);
                showToast("Đã thêm vào hàng đợi");
            } catch (err) {
                console.error(err);
                showToast("Lỗi khi thêm bài", true);
                btnAdd.disabled = false;
            }
        });
        
        const btnDetails = item.querySelector('.btn-transparency-details');
        if (btnDetails) {
            btnDetails.addEventListener('click', () => {
                showCopyrightModal(video);
            });
        }
        
        container.appendChild(item);
    });
    
    lastSearchResultsHTML = container.innerHTML;
    
    if (loadMoreBtn) {
        if (currentSearchState.nextPageToken && currentSearchState.resultCount < MAX_SEARCH_RESULTS) {
            loadMoreBtn.innerText = 'XEM THÊM';
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.disabled = false;
            loadMoreBtn.style.opacity = '1';
        } else if (currentSearchState.resultCount >= MAX_SEARCH_RESULTS) {
            loadMoreBtn.innerText = `Đã hiển thị ${currentSearchState.resultCount} kết quả`;
            loadMoreBtn.classList.remove('hidden');
            loadMoreBtn.disabled = true;
            loadMoreBtn.style.opacity = '0.5';
        } else {
            loadMoreBtn.classList.add('hidden');
        }
    }
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

// Show modal
function showCopyrightModal(video) {
    const modal = document.getElementById('copyright-modal');
    if (!modal || !video.copyright) return;
    
    const cr = video.copyright;
    
    let licenseText = "Không có thông tin";
    if (cr.license === "youtube") licenseText = "YouTube Standard License";
    else if (cr.license === "creativeCommon") licenseText = "Creative Commons";
    
    document.getElementById('modal-cr-score').innerText = `${cr.score}% • ${cr.level}`;
    document.getElementById('modal-cr-licensed').innerText = cr.licensedContent ? "Có tín hiệu partner claim" : "Không có tín hiệu partner claim";
    document.getElementById('modal-cr-license').innerText = licenseText;
    document.getElementById('modal-cr-credit').innerText = cr.creditFound ? "Có" : "Không phát hiện";
    document.getElementById('modal-cr-embed').innerText = cr.embeddable ? "Có" : "Không";
    document.getElementById('modal-cr-region').innerText = cr.regionRestriction ? "Có hạn chế" : "Không phát hiện hạn chế";
    
    modal.classList.remove('hidden');
}

// Close modal
const closeBtn = document.getElementById('btn-close-modal');
if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        document.getElementById('copyright-modal').classList.add('hidden');
    });
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

init();
