/**
 * Wrapper for YouTube IFrame Player API
 */

let player;
let isPlayerReady = false;

export function initYouTubePlayer(containerId, onStateChangeCallback, onErrorCallback, onReadyCallback) {
    return new Promise((resolve) => {
        // Load the IFrame Player API code asynchronously.
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
            player = new YT.Player(containerId, {
                height: '100%',
                width: '100%',
                playerVars: {
                    'autoplay': 1,
                    'controls': 1, // Optional: keep controls if needed on TV
                    'disablekb': 1,
                    'fs': 0,
                    'rel': 0,
                    'modestbranding': 1
                },
                events: {
                    'onReady': (event) => {
                        isPlayerReady = true;
                        if (onReadyCallback) onReadyCallback(event);
                        resolve();
                    },
                    'onStateChange': onStateChangeCallback,
                    'onError': onErrorCallback
                }
            });
        };
    });
}

export function loadVideoById(videoId) {
    if (isPlayerReady && player) {
        player.loadVideoById(videoId);
    }
}

export function playVideo() {
    if (isPlayerReady && player) {
        player.playVideo();
    }
}

export function pauseVideo() {
    if (isPlayerReady && player) {
        player.pauseVideo();
    }
}

export function stopVideo() {
    if (isPlayerReady && player) {
        player.stopVideo();
    }
}

export function getCurrentTime() {
    if (isPlayerReady && player) {
        return player.getCurrentTime();
    }
    return 0;
}

export function getPlayerState() {
    if (isPlayerReady && player && player.getPlayerState) {
        return player.getPlayerState();
    }
    return -1; // Unstarted
}

// Map of YouTube Player States
export const YT_STATES = {
    UNSTARTED: -1,
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5
};
