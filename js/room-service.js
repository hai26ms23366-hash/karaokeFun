import { db, ref, set, get, update, push, onValue, serverTimestamp, remove, getCurrentUid } from "./firebase-service.js";

/**
 * Creates a new room (TV Host)
 */
export async function createRoom(roomCode, roomName) {
    const uid = getCurrentUid();
    const roomRef = ref(db, `rooms/${roomCode}`);
    
    const roomData = {
        name: roomName,
        roomCode: roomCode,
        hostUid: uid,
        status: "waiting",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        player: {
            state: "idle",
            videoId: "",
            currentQueueId: "",
            positionSeconds: 0,
            updatedAt: serverTimestamp()
        }
    };
    
    await set(roomRef, roomData);
    return roomCode;
}

/**
 * Checks if a room exists
 */
export async function checkRoomExists(roomCode) {
    const roomRef = ref(db, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);
    return snapshot.exists() && snapshot.val().status !== 'closed';
}

/**
 * Joins a room as a participant
 */
export async function joinRoom(roomCode, displayName) {
    const uid = getCurrentUid();
    const participantRef = ref(db, `rooms/${roomCode}/participants/${uid}`);
    
    await set(participantRef, {
        displayName: displayName || `Khách ${Math.floor(Math.random() * 10000)}`,
        joinedAt: serverTimestamp()
    });
}

/**
 * Closes a room
 */
export async function closeRoom(roomCode) {
    const roomRef = ref(db, `rooms/${roomCode}`);
    await update(roomRef, {
        status: "closed",
        updatedAt: serverTimestamp()
    });
}

/**
 * Pushes a video to the queue
 */
export async function addToQueue(roomCode, videoData, displayName) {
    const uid = getCurrentUid();
    const queueRef = ref(db, `rooms/${roomCode}/queue`);
    
    const newItemRef = push(queueRef);
    await set(newItemRef, {
        videoId: videoData.id,
        title: videoData.title,
        channelTitle: videoData.channelTitle,
        thumbnailUrl: videoData.thumbnailUrl,
        addedByUid: uid,
        addedByName: displayName,
        status: "waiting",
        createdAt: serverTimestamp()
    });
    return newItemRef.key;
}

/**
 * Removes an item from the queue
 */
export async function removeFromQueue(roomCode, queueId) {
    const itemRef = ref(db, `rooms/${roomCode}/queue/${queueId}`);
    await remove(itemRef);
}

/**
 * Pushes a command to the room
 * Commands: PLAY, PAUSE, NEXT, PREVIOUS
 */
export async function sendCommand(roomCode, commandType) {
    const uid = getCurrentUid();
    const commandsRef = ref(db, `rooms/${roomCode}/commands`);
    
    const newCommandRef = push(commandsRef);
    await set(newCommandRef, {
        type: commandType,
        createdByUid: uid,
        createdAt: serverTimestamp(),
        handled: false
    });
}
