import { signIn } from "./firebase-service.js";
import { createRoom, closeRoom } from "./room-service.js";
import { db, ref, onValue, update, serverTimestamp } from "./firebase-service.js";
import { initYouTubePlayer, loadVideoById, playVideo, pauseVideo, YT_STATES, getPlayerState } from "./youtube-player.js";
import { getBaseUrl, generateRoomCode } from "./utils.js";

// DOM Elements
const createRoomView = document.getElementById('create-room-view');
const lobbyView = document.getElementById('lobby-view');
const playerView = document.getElementById('player-view');
const loadingOverlay = document.getElementById('loading-overlay');

// State
let currentRoomCode = null;
let currentQueue = [];
let currentQueueId = null;
let isPlaying = false;
let processedCommands = new Set();
let commandMutex = Promise.resolve(); // Simple mutex queue

// Initialize
async function init() {
    document.getElementById('btn-create-room').addEventListener('click', handleCreateRoom);
    document.getElementById('btn-start-session').addEventListener('click', handleStartSession);
    document.getElementById('btn-close-room-lobby').addEventListener('click', handleCloseRoom);
    document.getElementById('btn-close-room-player').addEventListener('click', handleCloseRoom);
}

// Shows loading overlay
function showLoading(show, text = 'Đang tải...') {
    document.getElementById('loading-text').innerText = text;
    loadingOverlay.classList.toggle('hidden', !show);
}

// Mutex lock for command execution to prevent race conditions (e.g. multiple NEXTs)
function enqueueCommand(commandFn) {
    commandMutex = commandMutex.then(commandFn).catch(console.error);
}

// Handle Room Creation
async function handleCreateRoom() {
    const roomNameInput = document.getElementById('room-name').value.trim();
    if (!roomNameInput) {
        showError('create-error', 'Vui lòng nhập tên phòng');
        return;
    }
    
    showLoading(true, 'Đang tạo phòng...');
    try {
        await signIn();
        const roomCode = generateRoomCode();
        await createRoom(roomCode, roomNameInput);
        currentRoomCode = roomCode;
        
        showLobby(roomNameInput, roomCode);
    } catch (error) {
        console.error("Create room error", error);
        showError('create-error', 'Không thể tạo phòng. Vui lòng thử lại.');
    } finally {
        showLoading(false);
    }
}

function showLobby(roomName, roomCode) {
    createRoomView.classList.add('hidden');
    lobbyView.classList.remove('hidden');
    
    document.getElementById('lobby-room-name').innerText = roomName;
    document.getElementById('lobby-room-code').innerText = roomCode;
    
    const joinUrl = `${getBaseUrl()}/room.html?r=${roomCode}`;
    
    const qrContainer = document.getElementById('lobby-qr');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: joinUrl,
        width: 256,
        height: 256,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.L
    });
    
    // Display the URL explicitly so the user can verify or type it
    const urlDisplay = document.getElementById('lobby-url-display') || document.createElement('div');
    urlDisplay.id = 'lobby-url-display';
    urlDisplay.style.marginTop = '1rem';
    urlDisplay.style.fontSize = '1.2rem';
    urlDisplay.style.wordBreak = 'break-all';
    urlDisplay.style.color = 'var(--text-secondary)';
    urlDisplay.innerText = joinUrl;
    
    if (!document.getElementById('lobby-url-display')) {
        qrContainer.parentNode.insertBefore(urlDisplay, qrContainer.nextSibling);
    }
}

// Start Session (Open Player)
async function handleStartSession() {
    showLoading(true, 'Đang khởi tạo trình phát...');
    try {
        await initYouTubePlayer(
            'youtube-player',
            onYouTubeStateChange,
            onYouTubeError,
            () => {
                showLoading(false);
                lobbyView.classList.add('hidden');
                playerView.classList.remove('hidden');
                
                // Show small QR
                const joinUrl = `${getBaseUrl()}/room.html?r=${currentRoomCode}`;
                document.getElementById('footer-room-code').innerText = currentRoomCode;
                const qrSmallContainer = document.getElementById('footer-qr');
                qrSmallContainer.innerHTML = '';
                new QRCode(qrSmallContainer, {
                    text: joinUrl,
                    width: 120,
                    height: 120,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.L
                });
                
                setupRealtimeListeners();
            }
        );
    } catch (error) {
        console.error(error);
        showLoading(false);
        alert('Lỗi khởi tạo YouTube Player');
    }
}

// Listen to Firebase DB
function setupRealtimeListeners() {
    // Listen to queue changes
    const queueRef = ref(db, `rooms/${currentRoomCode}/queue`);
    onValue(queueRef, (snapshot) => {
        if (!snapshot.exists()) {
            currentQueue = [];
            updateNextSongUI();
            return;
        }
        
        const items = [];
        snapshot.forEach(child => {
            items.push({ id: child.key, ...child.val() });
        });
        
        // Sort by createdAt
        items.sort((a, b) => a.createdAt - b.createdAt);
        currentQueue = items;
        updateNextSongUI();
        
        // Auto play if nothing is playing and we have waiting songs
        if (!isPlaying && !currentQueueId) {
            enqueueCommand(playNextSong);
        }
    });

    // Listen to commands
    const commandsRef = ref(db, `rooms/${currentRoomCode}/commands`);
    onValue(commandsRef, (snapshot) => {
        if (!snapshot.exists()) return;
        
        snapshot.forEach(child => {
            const cmd = child.val();
            const cmdId = child.key;
            
            if (!cmd.handled && !processedCommands.has(cmdId)) {
                processedCommands.add(cmdId);
                enqueueCommand(() => executeCommand(cmdId, cmd));
            }
        });
    });
}

// Execute Remote Command
async function executeCommand(cmdId, cmd) {
    console.log("Executing command", cmd.type);
    
    switch (cmd.type) {
        case 'PLAY':
            playVideo();
            break;
        case 'PAUSE':
            pauseVideo();
            break;
        case 'NEXT':
            await playNextSong();
            break;
        case 'PREVIOUS':
            await playPreviousSong();
            break;
    }
    
    // Mark command as handled
    const cmdRef = ref(db, `rooms/${currentRoomCode}/commands/${cmdId}`);
    await update(cmdRef, { handled: true });
}

// Queue logic
async function playNextSong() {
    const waitingSongs = currentQueue.filter(item => item.status === 'waiting');
    
    if (currentQueueId) {
        // Mark current as played
        const currentRef = ref(db, `rooms/${currentRoomCode}/queue/${currentQueueId}`);
        // Read current state to ensure safety
        const currentItem = currentQueue.find(i => i.id === currentQueueId);
        if (currentItem && currentItem.status === 'playing') {
            await update(currentRef, { status: 'played' });
        }
    }
    
    if (waitingSongs.length > 0) {
        const nextSong = waitingSongs[0];
        currentQueueId = nextSong.id;
        
        const nextRef = ref(db, `rooms/${currentRoomCode}/queue/${currentQueueId}`);
        await update(nextRef, { status: 'playing' });
        
        document.getElementById('player-overlay').classList.add('hidden');
        document.getElementById('current-song-title').innerText = nextSong.title;
        
        loadVideoById(nextSong.videoId);
        isPlaying = true;
    } else {
        currentQueueId = null;
        isPlaying = false;
        document.getElementById('player-overlay').classList.remove('hidden');
        document.getElementById('current-song-title').innerText = "Không có";
        
        if (getPlayerState() !== YT_STATES.UNSTARTED) {
            pauseVideo();
        }
        await updatePlayerState('idle');
    }
}

async function playPreviousSong() {
    // Basic implementation: find last played song
    const playedSongs = currentQueue.filter(item => item.status === 'played');
    if (playedSongs.length > 0) {
        const lastPlayed = playedSongs[playedSongs.length - 1];
        
        // Re-queue it (or just play it). Let's set it back to playing.
        if (currentQueueId) {
            const currentRef = ref(db, `rooms/${currentRoomCode}/queue/${currentQueueId}`);
            await update(currentRef, { status: 'waiting' }); // push current back to waiting
        }
        
        currentQueueId = lastPlayed.id;
        const targetRef = ref(db, `rooms/${currentRoomCode}/queue/${currentQueueId}`);
        await update(targetRef, { status: 'playing' });
        
        document.getElementById('player-overlay').classList.add('hidden');
        document.getElementById('current-song-title').innerText = lastPlayed.title;
        
        loadVideoById(lastPlayed.videoId);
        isPlaying = true;
    }
}

function updateNextSongUI() {
    const waitingSongs = currentQueue.filter(item => item.status === 'waiting');
    
    // Check if the currentQueueId is no longer playing (e.g. removed by host)
    if (currentQueueId) {
        const currentlyPlayingItem = currentQueue.find(item => item.id === currentQueueId);
        if (!currentlyPlayingItem || currentlyPlayingItem.status !== 'playing') {
            // Re-evaluate playing state
            if (!currentlyPlayingItem) {
                // Item was deleted
                enqueueCommand(playNextSong);
            }
        }
    }
    
    if (waitingSongs.length > 0) {
        // If currentQueueId is set, the next song is the first waiting one
        // If currentQueueId is NOT set, playNextSong will pick the first waiting one.
        document.getElementById('next-song-title').innerText = waitingSongs[0].title;
    } else {
        document.getElementById('next-song-title').innerText = "Không có";
    }
}

// YouTube Callbacks
function onYouTubeStateChange(event) {
    switch (event.data) {
        case YT_STATES.PLAYING:
            updatePlayerState('playing').catch(console.error);
            break;
        case YT_STATES.PAUSED:
            updatePlayerState('paused').catch(console.error);
            break;
        case YT_STATES.ENDED:
            updatePlayerState('ended').catch(console.error);
            enqueueCommand(playNextSong);
            break;
    }
}

function onYouTubeError(event) {
    console.error("YouTube Player Error", event.data);
    // 2, 5, 100, 101, 150
    // Mark current song as playbackFailed and skip
    if (currentQueueId) {
        enqueueCommand(async () => {
            const currentRef = ref(db, `rooms/${currentRoomCode}/queue/${currentQueueId}`);
            await update(currentRef, { status: 'playbackFailed' });
            // Wait 2 seconds then next
            await new Promise(resolve => setTimeout(resolve, 2000));
            await playNextSong();
        });
    }
}

// Update Firebase Player state
async function updatePlayerState(state) {
    if (!currentRoomCode) return;
    const playerRef = ref(db, `rooms/${currentRoomCode}/player`);
    const currentItem = currentQueue.find(i => i.id === currentQueueId);
    
    await update(playerRef, {
        state: state,
        videoId: currentItem ? currentItem.videoId : "",
        title: currentItem ? currentItem.title : "",
        currentQueueId: currentQueueId || "",
        updatedAt: serverTimestamp()
    });
}

function showError(elId, msg) {
    const el = document.getElementById(elId);
    el.innerText = msg;
    el.classList.remove('hidden');
}

async function handleCloseRoom() {
    if (confirm("Bạn có chắc chắn muốn đóng phòng?")) {
        if (currentRoomCode) {
            await closeRoom(currentRoomCode);
        }
        window.location.reload();
    }
}

init();
