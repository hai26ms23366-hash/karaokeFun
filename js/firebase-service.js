import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, set, get, update, push, onValue, serverTimestamp, remove, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase safely to prevent duplicate app errors from cache-busted imports
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;

/**
 * Signs in anonymously and returns the user object.
 * @returns {Promise<Object>}
 */
export function signIn() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                resolve(user);
            }
        });

        signInAnonymously(auth).catch((error) => {
            console.error("Auth error:", error);
            reject(error);
        });
    });
}

/**
 * Gets the current authenticated user ID
 * @returns {string|null}
 */
export function getCurrentUid() {
    return currentUser ? currentUser.uid : null;
}

export {
    auth,
    db,
    ref,
    set,
    get,
    update,
    push,
    onValue,
    serverTimestamp,
    remove,
    query,
    orderByChild,
    equalTo
};
