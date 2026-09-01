import { YOUTUBE_API_KEY } from "./firebase-config.js";

const searchCache = {};

/**
 * Searches YouTube Data API for karaoke videos
 * @param {string} query 
 * @returns {Promise<Array>} Array of video objects
 */
export async function searchYouTube(query) {
    if (!query || query.trim().length < 3) return [];

    let searchQuery = query.trim();
    if (!searchQuery.toLowerCase().includes("karaoke")) {
        searchQuery += " karaoke";
    }

    if (searchCache[searchQuery]) {
        return searchCache[searchQuery];
    }

    if (YOUTUBE_API_KEY === "YOUR_YOUTUBE_API_KEY" || !YOUTUBE_API_KEY) {
        console.warn("YouTube API Key is not configured. Returning mock data.");
        // Mock data for MVP testing if no key is provided
        return [
            {
                id: "MOCK_ID_1",
                title: `${searchQuery} - Mock Video 1`,
                channelTitle: "Karaoke Channel",
                thumbnailUrl: "https://via.placeholder.com/120x68"
            }
        ];
    }

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

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "YouTube API Error");
        }
        const data = await response.json();
        
        const results = data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnailUrl: item.snippet.thumbnails.default.url
        }));

        searchCache[searchQuery] = results;
        return results;
    } catch (error) {
        console.error("Error searching YouTube:", error);
        throw error;
    }
}
