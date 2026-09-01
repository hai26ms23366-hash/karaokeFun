import { YOUTUBE_API_KEY } from "./firebase-config.js";

const searchCache = {};
const CACHE_TTL = 3600000; // 1 hour in ms
let currentSearchController = null;

/**
 * Normalizes query string for caching
 */
function getCacheKey(query, pageToken = "") {
    let key = "karaoke_search_" + query.trim().toLowerCase().replace(/\s+/g, ' ');
    if (pageToken) key += "_" + pageToken;
    return key;
}

/**
 * Retrieves data from in-memory or localStorage cache
 */
function getFromCache(query, pageToken = "") {
    const key = getCacheKey(query, pageToken);
    
    // Memory cache
    if (searchCache[key]) {
        return searchCache[key];
    }
    
    // LocalStorage cache
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Date.now() - parsed.timestamp < CACHE_TTL) {
                searchCache[key] = parsed.data; // put in memory
                return parsed.data;
            } else {
                localStorage.removeItem(key);
            }
        }
    } catch (e) {
        console.error("Cache read error", e);
    }
    return null;
}

/**
 * Saves data to in-memory and localStorage cache
 */
function saveToCache(query, pageToken = "", data) {
    const key = getCacheKey(query, pageToken);
    searchCache[key] = data;
    try {
        localStorage.setItem(key, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));
    } catch (e) {
        console.error("Cache write error", e);
    }
}

/**
 * Fetches batch video details using videos.list
 */
async function fetchVideoDetails(videoIds) {
    if (!videoIds || videoIds.length === 0) return {};
    
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.append("part", "snippet,status,contentDetails");
    url.searchParams.append("id", videoIds.join(","));
    url.searchParams.append("key", YOUTUBE_API_KEY);
    
    try {
        const res = await fetch(url);
        if (!res.ok) return {};
        const data = await res.json();
        
        const detailsMap = {};
        data.items.forEach(item => {
            detailsMap[item.id] = item;
        });
        return detailsMap;
    } catch (e) {
        console.error("Error fetching video details", e);
        return {};
    }
}

/**
 * Calculates a transparency score based on metadata and heuristics
 */
function calculateTransparencyScore(videoDetail, searchSnippet) {
    if (!videoDetail) {
        return {
            score: 0,
            level: "Chưa rõ",
            licensedContent: false,
            license: "Không có thông tin",
            creditFound: false,
            embeddable: true,
            regionRestriction: false,
            fetchFailed: true
        };
    }

    let score = 0;
    
    // Primary Signals
    const licensedContent = videoDetail.contentDetails?.licensedContent || false;
    if (licensedContent) {
        score += 50; // Strong signal of official partner metadata
    }
    
    const license = videoDetail.status?.license || "youtube";
    if (license === "creativeCommon") {
        score += 20; // Clear licensing intent
    } else if (license === "youtube") {
        score += 10; // Standard, still a valid signal
    }
    
    // Secondary Signals (Heuristics)
    let creditFound = false;
    const description = (videoDetail.snippet?.description || searchSnippet?.description || "").toLowerCase();
    
    const creditKeywords = ["©", "℗", "composer", "songwriter", "publisher", "licensed by", "copyright", "all rights reserved", "tác giả", "sáng tác", "nhạc sĩ", "phát hành", "bản quyền"];
    
    for (const kw of creditKeywords) {
        if (description.includes(kw)) {
            creditFound = true;
            break;
        }
    }
    
    if (creditFound) {
        score += 20;
    }
    
    // Cap score at 100
    score = Math.min(100, score);
    score = Math.max(0, score);
    
    let level = "Thấp";
    if (score >= 80) level = "Cao";
    else if (score >= 50) level = "Trung bình";
    
    const embeddable = videoDetail.status?.embeddable !== false;
    const regionRestriction = !!videoDetail.contentDetails?.regionRestriction;

    return {
        score: score,
        level: level,
        licensedContent: licensedContent,
        license: license,
        creditFound: creditFound,
        embeddable: embeddable,
        regionRestriction: regionRestriction,
        fetchFailed: false
    };
}

/**
 * Builds the final YouTube search query based on input parameters
 */
export function buildSearchQuery({ keyword = "", artist = "", categoryQuery = "" }) {
    if (categoryQuery) {
        return categoryQuery.trim();
    }
    
    const k = keyword.trim();
    const a = artist.trim();
    
    if (k && a) {
        return `${k} ${a} karaoke`;
    } else if (k) {
        return `${k} karaoke`;
    } else if (a) {
        return `${a} karaoke`;
    }
    return "";
}

/**
 * Searches YouTube Data API for karaoke videos with Caching and AbortController
 * @param {Object} queryParameters 
 * @returns {Promise<Object>} { results, query, aborted, errorMsg }
 */
export async function searchYouTube(queryParameters, pageToken = "") {
    const searchQuery = buildSearchQuery(queryParameters);
    
    if (!searchQuery) {
        return { results: [], query: "" };
    }

    const cached = getFromCache(searchQuery, pageToken);
    if (cached) {
        // Handle legacy cache format (array) - ignore and fetch fresh to get nextPageToken
        if (Array.isArray(cached)) {
            const key = getCacheKey(searchQuery, pageToken);
            delete searchCache[key];
            try { localStorage.removeItem(key); } catch (e) {}
            // fall through to fetch fresh
        } else {
            return { results: cached.results || [], nextPageToken: cached.nextPageToken || null, query: searchQuery };
        }
    }

    if (YOUTUBE_API_KEY === "YOUR_YOUTUBE_API_KEY" || !YOUTUBE_API_KEY) {
        return { errorMsg: "API Key chưa được cấu hình (API key not configured)." };
    }

    // Cancel previous ongoing request
    if (currentSearchController) {
        currentSearchController.abort();
    }
    currentSearchController = new AbortController();
    const signal = currentSearchController.signal;

    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.append("part", "snippet");
    url.searchParams.append("type", "video");
    url.searchParams.append("videoEmbeddable", "true");
    url.searchParams.append("videoSyndicated", "true");
    url.searchParams.append("regionCode", "VN");
    url.searchParams.append("relevanceLanguage", "vi");
    url.searchParams.append("safeSearch", "moderate");
    url.searchParams.append("maxResults", "10");
    url.searchParams.append("order", "relevance");
    url.searchParams.append("q", searchQuery);
    url.searchParams.append("key", YOUTUBE_API_KEY);

    if (pageToken) {
        url.searchParams.append("pageToken", pageToken);
    }

    try {
        const response = await fetch(url, { signal });
        
        if (!response.ok) {
            const errorData = await response.json();
            const msg = errorData.error?.message || "Lỗi API YouTube";
            
            // Check for quota exceeded
            if (errorData.error?.errors?.[0]?.reason === "quotaExceeded") {
                return { errorMsg: "Đã vượt quá giới hạn lượt tìm kiếm trong ngày (Quota exceeded)." };
            }
            return { errorMsg: msg };
        }
        
        const data = await response.json();
        
        const videoIds = data.items.map(item => item.id.videoId);
        const detailsMap = await fetchVideoDetails(videoIds);
        
        const results = data.items.map(item => {
            const rawTitle = item.snippet.title;
            const channel = item.snippet.channelTitle;
            
            // Extract Tone
            let tone = "";
            const toneMatch = rawTitle.match(/(tone\s+nam|tone\s+nữ|giọng\s+nam|giọng\s+nữ|song\s+ca)/i);
            if (toneMatch) {
                tone = toneMatch[0];
            }
            
            // Clean title
            let cleanTitle = rawTitle
                .replace(/(karaoke|beat chuẩn|beat|hd|official|lyric|video|mv)/gi, "")
                .replace(/(tone\s+nam|tone\s+nữ|giọng\s+nam|giọng\s+nữ|song\s+ca)/gi, "")
                .replace(/\[.*?\]|\(.*?\)/g, "") // remove text in brackets
                .replace(/\s+/g, " ") // reduce multiple spaces
                .trim();
                
            // Split by common delimiters (- | ~)
            let parts = cleanTitle.split(/[-|~]/).map(p => p.trim()).filter(p => p.length > 0);
            
            let songName = parts[0] || rawTitle;
            let author = parts.length > 1 ? parts.slice(1).join(" - ") : "";

            return {
                id: item.id.videoId,
                title: rawTitle,
                channelTitle: channel,
                thumbnailUrl: item.snippet.thumbnails.default.url,
                parsed: {
                    songName: songName,
                    tone: tone,
                    author: author,
                    producer: channel
                },
                copyright: calculateTransparencyScore(detailsMap[item.id.videoId], item.snippet)
            };
        });

        const cacheData = { results, nextPageToken: data.nextPageToken || null };
        saveToCache(searchQuery, pageToken, cacheData);
        return { results, nextPageToken: cacheData.nextPageToken, query: searchQuery };
        
    } catch (error) {
        if (error.name === 'AbortError') {
            return { aborted: true };
        }
        console.error("Error searching YouTube:", error);
        return { errorMsg: "Lỗi kết nối mạng hoặc API." };
    }
}
