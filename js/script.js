// Prevent uncaught AbortError from Spotify iframe
window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && (
        event.reason.message === 'The play() request was interrupted by a call to pause().' ||
        event.reason.name === 'AbortError' ||
        (typeof event.reason === 'string' && event.reason.includes('AbortError'))
    )) {
        event.preventDefault();
    }
});
// Unified media picker (videos + static images)
async function getVideo(video_origin) { // keeping original name for minimal integration changes
    if (video_origin !== 'file') {
        console.log('ERROR: WRONG MEDIA ORIGIN');
        return false;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,image/*';
    input.multiple = true;

    input.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        let lastAddedKey = null;

        for (const file of files) {
            const extension = file.name.split('.').pop().toLowerCase();
            const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(extension); // allowed video types
            const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension); // allowed image types
            if (!(isVideo || isImage)) {
                updateSettings([0], 'error', 'format unsupported', file.name);
                console.error(`Error: .${extension} file format is not supported`);
                continue;
            }
            try {
                const thumbnail = await getThumbnail(file, isVideo ? 'video' : 'image');
                const db = await openDB('videoDB', 2);
                const tx = db.transaction('videos', 'readwrite');
                const store = tx.objectStore('videos');
                // New unified record structure (backward compatible reading maintained elsewhere)
                const record = {
                    blob: file,
                    thumbnail: thumbnail,
                    type: isVideo ? 'video' : 'image',
                    mime: file.type || (isVideo ? 'video/*' : 'image/*')
                };
                const request = store.put(record);
                await new Promise((resolve) => (request.onsuccess = resolve));
                lastAddedKey = request.result;
                updateSettings([request.result], 'last');
                await tx.done;
                showPush(`${file.name} added successfully!`, 'default');
            } catch (err) {
                console.error(`Error adding ${file.name} to object store: ${err}`);
            }
        }
        updateVideo('getVideo');

        // Set the last added wallpaper as Primary and scroll to it
        if (lastAddedKey !== null) {
            setTimeout(async () => {
                await setActiveVideoKey(lastAddedKey);
                updateVideo('SET_BUTTON');

                // Wait longer for DOM to fully update
                setTimeout(() => {
                    const listContainer = document.getElementById('wallpapers-list');
                    if (listContainer) {
                        const newCard = listContainer.querySelector(`[data-key="${lastAddedKey}"]`);
                        if (newCard) {
                            // Update card to show as active
                            newCard.classList.add('active');

                            // Update button text to "Unset"
                            const setBtn = newCard.querySelector('.fav-set');
                            if (setBtn) {
                                setBtn.textContent = 'Unset';
                            }

                            // Remove active state from all other cards
                            const allCards = listContainer.querySelectorAll('.fav-card');
                            allCards.forEach(c => {
                                if (c !== newCard) {
                                    c.classList.remove('active');
                                    const btn = c.querySelector('.fav-set');
                                    if (btn) btn.textContent = 'Set';
                                }
                            });

                            // Scroll to the new card
                            newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }

                    showPush('✨ Wallpaper automatically set as Primary!', 'success');
                }, 300);
            }, 100);
        }
    });
    input.click();
}

// Generate thumbnail for either video or image
async function getThumbnail(fileBlob, kind) {
    if (kind === 'video' || (fileBlob.type && fileBlob.type.startsWith('video'))) {
        // Video snapshot
        const video = document.createElement('video');
        const videoBlob = URL.createObjectURL(fileBlob);
        video.setAttribute('preload', 'metadata');
        video.src = videoBlob;
        video.currentTime = 2;
        await new Promise((resolve) => video.addEventListener('loadeddata', resolve));
        const w = video.videoWidth;
        const h = video.videoHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(video, 0, 0, w, h);
        const thumbnail = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.2));
        return thumbnail;
    } else {
        // Image scaling (downscale large images for lighter storage)
        const img = document.createElement('img');
        img.src = URL.createObjectURL(fileBlob);
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
        const maxDim = 800; // limit largest side
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const thumbnail = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
        return thumbnail || fileBlob; // fallback to original if toBlob fails
    }
}

async function openDB(name, version) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (ev) => {
            const db = request.result;
            // v1 -> initial store; v2 keeps same store but we may in future migrate structure
            if (!db.objectStoreNames.contains('videos')) {
                db.createObjectStore('videos', { keyPath: 'num', autoIncrement: true });
            }
            // We keep existing data (arrays) as-is; new writes store objects {blob,thumbnail,type,mime}
        };
    });
}

// Count only live wallpapers (video records) stored in IndexedDB
async function countLiveWallpapers() {
    const db = await openDB('videoDB', 2);
    const tx = db.transaction('videos', 'readonly');
    const store = tx.objectStore('videos');
    return new Promise((resolve) => {
        let count = 0;
        store.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const val = cursor.value;
                // new schema: object with type; legacy schema may be array
                const isVideo = (val && typeof val === 'object' && 'type' in val) ? (val.type === 'video') : true;
                if (isVideo) count++;
                cursor.continue();
            } else {
                resolve(count);
            }
        };
    });
}

// Retrieve a video from the DB by the defined key value
async function getVideoBlob(key) {
    const db = await openDB('videoDB', 2);
    const tx = db.transaction('videos', 'readonly');
    const store = tx.objectStore('videos');
    const request = store.get(key);
    await new Promise((resolve) => { request.onsuccess = resolve; });
    return request.result; // could be legacy array or new object
}

// -------- OLD LOGIN SYSTEM REMOVED --------
// Now using License Key system with LemonSqueezy

// Call this function when a video is successfully deleted
async function deleteVideoBlob(key) {
    const db = await openDB('videoDB', 2);
    const tx = db.transaction('videos', 'readwrite');
    const store = tx.objectStore('videos');

    // Save scroll position before deletion
    const sideNav = document.getElementById('mySidenav');
    const scrollPosition = sideNav ? sideNav.scrollTop : 0;

    try {
        store.delete(key);
        await tx.done;
        // If the deleted key was the active one, remove activeVideoKey
        chrome.storage.local.get(['activeVideoKey'], (res) => {
            if (res && res.activeVideoKey === key) {
                chrome.storage.local.remove(['activeVideoKey']);
            }
        });

        showPush('Animated Wallpaper deleted successfully!', 'default');
        // Refresh video and settings
        updateVideo();

        // Restore scroll position after deletion completes
        setTimeout(() => {
            if (sideNav) {
                sideNav.scrollTop = scrollPosition;
            }
        }, 100);
    } catch (e) {
        console.error('Error:', e);
    }
}

// Retrieve all the keys in the DB to present videos and thumbnails
async function getAllKeys() {
    const db = await openDB('videoDB', 2);
    const tx = db.transaction('videos', 'readonly');
    const store = tx.objectStore('videos');
    const keys = [];
    await tx.done;
    return new Promise((resolve) => {
        store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                keys.push(cursor.key);
                cursor.continue();
            } else {
                resolve(keys);
            }
        };
    });
}

// Retrieve a random video, if one exists, and set it as the background
async function updateVideo(calledFrom) { // retains name for existing invocations
    const allKeys = await getAllKeys();
    const keys = allKeys;
    let mediaRecord; // unified record
    let mediaURL;
    let mediaType = 'video';

    // If there are no uploaded videos, use default
    if (keys[0] === undefined) {
        mediaURL = '../videos/default.mp4';
    } else {
        // chrome.storage.local.set({ activeVideoKey: "sooooool" }); // Clear active video on new tab open to avoid stale state

        // Check if user has selected an active video in storage
        const activeObj = await new Promise((resolve) =>
            chrome.storage.local.get(['activeVideoKey'], resolve)
        );
        const activeKey = activeObj && activeObj.activeVideoKey ? activeObj.activeVideoKey : null;

        if (activeKey === 'default') {
            // Use default wallpaper
            mediaURL = '../videos/default.mp4';
            mediaType = 'video';
        } else if (activeKey && keys.includes(Number(activeKey) || activeKey)) {
            // Use the user-selected active video
            const useKey = Number(activeKey) || activeKey;
            mediaRecord = await getVideoBlob(useKey);
        } else {
            // Check rotation settings (user can include specific keys in rotation)
            const rot = await getRotationData();
            const rotationKeys = Array.isArray(rot.rotationKeys) ? rot.rotationKeys.map(x => Number(x)) : [];
            const rotationMode = rot.rotationMode || 'random';
            let chosenKey = null;

            if (rotationKeys.length > 0) {
                // pick from rotationKeys (only those that still exist in DB)
                const validRotation = rotationKeys.filter(k => keys.includes(k));
                if (validRotation.length > 0) {
                    if (rotationMode === 'sequence') {
                        const idx = Number(rot.rotationIndex) || 0;
                        const pick = validRotation[idx % validRotation.length];
                        chosenKey = pick;
                        // save next index
                        await setRotationIndex((idx + 1) % validRotation.length);
                    } else {
                        chosenKey = validRotation[Math.floor(Math.random() * validRotation.length)];
                    }
                }
            }

            if (chosenKey === null) {
                // Fallback to random video from available keys
                let key = keys[Math.floor(Math.random() * keys.length)];
                chosenKey = key;
            }

            mediaRecord = await getVideoBlob(chosenKey);
        }
    }

    // Normalize legacy vs new record
    if (mediaRecord) {
        if (Array.isArray(mediaRecord)) { // legacy: [blob, thumbnail]
            mediaURL = URL.createObjectURL(mediaRecord[0]);
            mediaType = 'video';
        } else if (mediaRecord && mediaRecord.blob) {
            mediaURL = URL.createObjectURL(mediaRecord.blob);
            mediaType = mediaRecord.type || (mediaRecord.mime && mediaRecord.mime.startsWith('image') ? 'image' : 'video');
        }
    }

    // Fallback if still undefined
    if (!mediaURL) {
        mediaURL = '../videos/default.mp4';
        mediaType = 'video';
    }

    if (calledFrom === 'deleteVideoBlob') {
        // do nothing
    } else if (calledFrom === 'getVideo') {
        // After adding new video, update settings to show/hide Set buttons
        updateSettings(keys, 'all');
    } else if (calledFrom !== 'SET_BUTTON') {
        // Don't update UI when called from SET button (to avoid scroll jump)
        updateSettings(keys, 'all');
    }

    if (document.getElementById('mainVideo')) { // We reuse same id for simplicity across media types
        let doc = document.getElementById('mainVideo');
        doc.setAttribute('id', 'removing');
        doc.style.filter = 'opacity(1)';
        setTimeout(function () {
            doc.style.filter = 'opacity(0)';
        }, 100);
        setTimeout(function () {
            doc.remove();
        }, 1100);
    }
    if (mediaURL !== 'null') {
        let container = document.getElementById('background');
        if (!container) return;
        let elem;
        if (mediaType === 'image') {
            elem = document.createElement('img');
            elem.setAttribute('id', 'mainVideo'); // keep id to avoid refactor ripple
            elem.src = mediaURL;
            elem.style.objectFit = 'cover';
            elem.style.width = '100%';
            elem.style.height = '100%';
            elem.style.position = 'absolute';
            elem.style.top = '0';
            elem.style.left = '0';
            elem.style.opacity = '0';
            elem.style.transition = 'opacity 1s ease, filter 1s ease';
            setTimeout(() => { elem.style.opacity = '1'; elem.style.filter = 'blur(0px)'; }, 50);
        } else {
            elem = document.createElement('video');
            elem.setAttribute('id', 'mainVideo');
            elem.src = mediaURL;
        }
        container.prepend(elem);
        if (mediaType === 'video') {
            playVideo(elem);
            // Check if animation should be paused based on user setting
            checkAndApplyVideoPlaybackState(elem);
        }
    } else {
        console.log('No media found');
    }
}

// -------- Premium modal helpers --------
// -------- OLD PREMIUM POPUP FUNCTIONS REMOVED --------
// Now fully free and unlimited - no account system

// Helper to set active video key in storage
function setActiveVideoKey(key) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ activeVideoKey: key }, () => {
            resolve();
        });
    });
}

// Helper to get active video key
function getActiveVideoKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['activeVideoKey'], (res) => {
            resolve(res && res.activeVideoKey ? res.activeVideoKey : null);
        });
    });
}

// Play the background elem video
function playVideo(video_elem) {
    video_elem.muted = true;
    video_elem.setAttribute('autoplay', 'autoplay');
    video_elem.setAttribute('preload', 'auto');
    video_elem.setAttribute('loop', 'loop');

    video_elem.play().catch(err => console.log('Video play prevented:', err));

    setTimeout(function () {
        video_elem.style.filter = 'blur(0px)';
        video_elem.style.opacity = '1';
    }, 50);
}

// Pause the background video
function pauseVideo(video_elem) {
    if (video_elem && video_elem.pause) {
        video_elem.pause();
    }
}

// Resume the background video
function resumeVideo(video_elem) {
    if (video_elem && video_elem.play) {
        video_elem.play();
    }
}

// Handle video playback toggle (with notification for user actions)
function handleVideoPlaybackToggle(isEnabled, showNotification = true) {
    localStorage.setItem('videoPlaybackEnabled', isEnabled.toString());

    // Control logo floating animation
    const logoElement = document.getElementById('wLogo');
    if (logoElement) {
        if (isEnabled) {
            logoElement.classList.add('animate-logo');
        } else {
            logoElement.classList.remove('animate-logo');
        }
    }

    // Find current background video element
    const backgroundDiv = document.getElementById('background');
    if (!backgroundDiv) return;

    const videoElement = backgroundDiv.querySelector('video');
    if (!videoElement) return;

    if (isEnabled) {
        // Resume video animation
        resumeVideo(videoElement);
        if (showNotification) {
            showPush('Live wallpaper animation enabled', 'default');
        }
    } else {
        // Pause video to save battery
        pauseVideo(videoElement);
        if (showNotification) {
            showPush('Live wallpaper animation disabled', 'default');
        }
    }
}

// Initialize video playback state on page load (silently, no notification)
function initVideoPlaybackState() {
    const videoEnabled = localStorage.getItem('videoPlaybackEnabled');
    // Default to enabled if not set
    const isEnabled = videoEnabled === null ? true : videoEnabled === 'true';

    // Set initial logo animation state
    const logoElement = document.getElementById('wLogo');
    if (logoElement) {
        if (isEnabled) {
            logoElement.classList.add('animate-logo');
        } else {
            logoElement.classList.remove('animate-logo');
        }
    }

    setTimeout(() => {
        // Pass false to disable notification on page load
        handleVideoPlaybackToggle(isEnabled, false);
    }, 1000); // Wait a bit for video to load
}

// Check and apply video playback state for a specific video element
function checkAndApplyVideoPlaybackState(videoElement) {
    const videoEnabled = localStorage.getItem('videoPlaybackEnabled');
    // Default to enabled if not set
    const isEnabled = videoEnabled === null ? true : videoEnabled === 'true';

    if (!isEnabled && videoElement) {
        // If animation is disabled, pause the video after a short delay
        setTimeout(() => {
            pauseVideo(videoElement);
        }, 100);
    }
}

// Add default wallpaper card that cannot be deleted
function addDefaultWallpaperCard(container, customWallpapersCount = 0) {
    const card = document.createElement('div');
    card.className = 'fav-card default-wallpaper';
    card.dataset.key = 'default';

    // Default wallpaper thumbnail (static image, not live video)
    const thumb = document.createElement('img');
    thumb.className = 'fav-thumb default-thumb';
    thumb.alt = 'default wallpaper thumbnail';
    thumb.style.objectFit = 'cover';
    thumb.style.pointerEvents = 'none';

    // Generate thumbnail from default video on load
    (async () => {
        try {
            const response = await fetch('../videos/default.mp4');
            const blob = await response.blob();
            const thumbnail = await getThumbnail(blob, 'video');
            thumb.src = URL.createObjectURL(thumbnail);
        } catch (err) {
            // Fallback: gradient background
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = 'fav-thumb default-thumb';
            fallbackDiv.style.background = 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)';
            fallbackDiv.style.display = 'flex';
            fallbackDiv.style.alignItems = 'center';
            fallbackDiv.style.justifyContent = 'center';
            fallbackDiv.style.color = 'rgba(255,255,255,0.7)';
            fallbackDiv.style.fontSize = '2em';
            fallbackDiv.innerHTML = '🌌';
            if (thumb.parentNode) {
                thumb.parentNode.replaceChild(fallbackDiv, thumb);
            } else {
                card.insertBefore(fallbackDiv, card.firstChild);
            }
        }
    })();

    // Buttons container
    const btns = document.createElement('div');
    btns.className = 'fav-btns';

    // Set as Active button (only show if there are custom wallpapers)
    const setBtn = document.createElement('button');
    setBtn.className = 'fav-set';
    setBtn.textContent = 'Set';

    // Hide "Set" button if no custom wallpapers exist
    if (customWallpapersCount === 0) {
        setBtn.style.display = 'none';
    }

    setBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        // Save scroll position of the sidenav before any updates
        const sideNav = document.getElementById('mySidenav');
        const scrollPosition = sideNav ? sideNav.scrollTop : 0;

        const currentActive = await getActiveVideoKey();
        if (currentActive === 'default') {
            // If already active, unset (toggle off)
            chrome.storage.local.remove(['activeVideoKey']);
            card.classList.remove('active');
            setBtn.textContent = 'Set';
            showPush('Removed from Primary', 'success');
            updateVideo('SET_BUTTON');
        } else {
            await setActiveVideoKey('default');
            showPush('Set as Primary (default wallpaper)', 'success');
            updateVideo('SET_BUTTON');
            // Update UI to reflect active state
            const allCards = document.querySelectorAll('.fav-card');
            allCards.forEach(c => {
                c.classList.remove('active');
                const b = c.querySelector('.fav-set');
                if (b) b.textContent = 'Set';
            });
            card.classList.add('active');
            setBtn.textContent = 'Unset';
        }

        // Restore scroll position after updateVideo completes
        setTimeout(() => {
            if (sideNav) {
                sideNav.scrollTop = scrollPosition;
            }
        }, 50);
    });

    // Default label instead of delete button
    const defaultLabel = document.createElement('span');
    defaultLabel.className = 'default-label';
    defaultLabel.textContent = 'Default';
    defaultLabel.style.background = 'rgba(59, 130, 246, 0.15)';
    defaultLabel.style.color = 'rgba(59, 130, 246, 0.9)';
    defaultLabel.style.border = '1px solid rgba(59, 130, 246, 0.3)';
    defaultLabel.style.padding = '4px 8px';
    defaultLabel.style.borderRadius = '6px';
    defaultLabel.style.fontSize = '0.75em';
    defaultLabel.style.fontWeight = '500';
    defaultLabel.style.display = 'flex';
    defaultLabel.style.alignItems = 'center';

    btns.appendChild(setBtn);
    btns.appendChild(defaultLabel);

    card.appendChild(thumb);
    card.appendChild(btns);
    container.appendChild(card);

    // Check if default wallpaper is currently active
    (async () => {
        const activeKey = await getActiveVideoKey();
        if (activeKey === 'default') {
            card.classList.add('active');
            setBtn.textContent = 'Unset';
        }
    })();
}

// Update the settings menu with all the users videos using the thumbnails
async function updateSettings(keys, toUpdate, errorMsg, fileName) {
    if (toUpdate === 'last') {
        keys = keys.slice(-1);
    }

    // Normalize and deduplicate keys to avoid duplicate UI entries
    if (Array.isArray(keys)) {
        const seen = new Set();
        const unique = [];
        for (const k of keys) {
            const ks = String(k);
            if (!seen.has(ks)) {
                seen.add(ks);
                unique.push(k);
            }
        }
        keys = unique;
    }

    // Populate minimalistic favorites list in the settings sidebar
    const listContainer = document.getElementById('wallpapers-list');
    if (!listContainer) return;

    // Save scroll position before updating
    const scrollPosition = listContainer.scrollTop;

    // Check if default wallpaper card already exists
    const existingDefaultCard = listContainer.querySelector('.default-wallpaper');

    // Clear previous custom wallpaper entries only (keep default if it exists)
    if (toUpdate !== 'last') {
        // Remove only custom wallpaper cards, not the default one
        const customCards = listContainer.querySelectorAll('.fav-card:not(.default-wallpaper)');
        customCards.forEach(card => card.remove());

        // Only add default wallpaper if it doesn't already exist
        if (!existingDefaultCard) {
            addDefaultWallpaperCard(listContainer, keys.length);
        } else {
            // Update the customWallpapersCount in the existing default card's Set button visibility
            const defaultCard = listContainer.querySelector('.default-wallpaper');
            const setBtn = defaultCard.querySelector('.fav-set');
            if (setBtn && keys.length === 0) {
                setBtn.style.display = 'none';
            } else if (setBtn && keys.length > 0) {
                setBtn.style.display = 'block';
            }
        }
    }

    // Get current active key to mark in UI
    const activeKey = await getActiveVideoKey();

    // Always show title and info when we have default + uploaded wallpapers
    const favTitle = document.getElementById('favorites-title');
    const infoMsg = document.getElementById('random-info-msg');
    if (favTitle) {
        favTitle.style.display = 'block';
        favTitle.textContent = 'Wallpapers';
        if (infoMsg) infoMsg.style.display = 'block';
    }

    for (const key of keys) {
        let thumbnailSrc = '';
        let pElemText = 'Remove';

        if (toUpdate !== 'error') {
            const record = await getVideoBlob(key);
            if (record) {
                if (Array.isArray(record)) { // legacy structure
                    thumbnailSrc = URL.createObjectURL(record[1]);
                } else if (record.thumbnail) {
                    thumbnailSrc = URL.createObjectURL(record.thumbnail);
                }
            }
        } else {
            pElemText = errorMsg;
        }

        // Card wrapper
        const card = document.createElement('div');
        card.className = 'fav-card';
        card.dataset.key = String(key);

        // Thumbnail
        const thumb = document.createElement('img');
        thumb.className = 'fav-thumb';
        thumb.src = thumbnailSrc || '';
        thumb.alt = 'thumbnail';

        // Buttons container
        const btns = document.createElement('div');
        btns.className = 'fav-btns';

        // Set as Active button

        const setBtn = document.createElement('button');
        setBtn.className = 'fav-set';
        // If this card is the active one on initial render, show Unset directly
        if (activeKey && String(activeKey) === String(key)) {
            card.classList.add('active');
            setBtn.textContent = 'Unset';
        } else {
            setBtn.textContent = 'Set';
        }

        // Hide "Set" button if there are no custom wallpapers (only default exists)
        // Show it only when there are at least 2 wallpapers (default + 1 custom)
        if (keys.length === 0) {
            setBtn.style.display = 'none';
        }

        setBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // Save scroll position of the sidenav before any updates
            const sideNav = document.getElementById('mySidenav');
            const scrollPosition = sideNav ? sideNav.scrollTop : 0;

            const k = parseInt(card.dataset.key);
            const currentActive = await getActiveVideoKey();
            if (currentActive && parseInt(currentActive) === k) {
                // If already active, unset (toggle off)
                chrome.storage.local.remove(['activeVideoKey']);
                card.classList.remove('active');
                setBtn.textContent = 'Set';
                showPush('Removed from Primary', 'success');
                updateVideo('SET_BUTTON');
            } else {
                await setActiveVideoKey(k);
                showPush('Set as Primary (will always be shown)', 'success');
                updateVideo('SET_BUTTON');
                // Update UI to reflect active state: clear others and reset their buttons
                const allCards = document.querySelectorAll('.fav-card');
                allCards.forEach(c => {
                    c.classList.remove('active');
                    const b = c.querySelector('.fav-set');
                    if (b) b.textContent = 'Set';
                });
                card.classList.add('active');
                setBtn.textContent = 'Unset';
            }

            // Restore scroll position after updateVideo completes
            setTimeout(() => {
                if (sideNav) {
                    sideNav.scrollTop = scrollPosition;
                }
            }, 50);
        });

        // Remove button
        const remBtn = document.createElement('button');
        remBtn.className = 'fav-remove';
        remBtn.textContent = pElemText;
        remBtn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Save scroll position of the sidenav before any updates
            const sideNav = document.getElementById('mySidenav');
            const scrollPosition = sideNav ? sideNav.scrollTop : 0;

            const k = parseInt(card.dataset.key);
            deleteVideoBlob(k);

            // Add deleting class for enhanced CSS animation
            card.classList.add('deleting');

            setTimeout(() => card.remove(), 800);

            // Restore scroll position after deletion animation
            setTimeout(() => {
                if (sideNav) {
                    sideNav.scrollTop = scrollPosition;
                }
            }, 850);
        });
        remBtn.removeAttribute('title');
        btns.appendChild(setBtn);

        // Include-in-rotation toggle
        const includeBtn = document.createElement('button');
        includeBtn.className = 'fav-include';
        includeBtn.title = 'Reload wallpaper';
        includeBtn.className = 'fav-include fav-random';
        includeBtn.title = 'Include in random rotation';
        includeBtn.innerHTML = '<span class="random-icon">✗</span>';
        includeBtn.style.background = 'rgba(255,255,255,0.08)';
        includeBtn.style.borderRadius = '8px';
        includeBtn.style.border = 'none';
        includeBtn.style.padding = '6px';
        includeBtn.style.cursor = 'pointer';
        includeBtn.style.display = 'flex';
        includeBtn.style.alignItems = 'center';
        includeBtn.style.transition = 'background 0.2s, box-shadow 0.2s';
        includeBtn.onmouseenter = () => {
            includeBtn.style.background = 'rgba(80,80,80,0.18)';
            includeBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
        };
        includeBtn.onmouseleave = () => {
            includeBtn.style.background = 'rgba(255,255,255,0.08)';
            includeBtn.style.boxShadow = 'none';
        };
        includeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();

            // Check if there's a primary wallpaper set
            const activeKey = await getActiveVideoKey();
            if (activeKey) {
                // If active wallpaper is the default, show message that default doesn't use random
                if (activeKey === 'default') {
                    showPush('Cannot use random rotation: Default wallpaper is set as Primary. Unset it first!', null, 'warning');
                } else {
                    showPush('Cannot use random rotation: A Primary wallpaper is already set. Unset it first!', null, 'warning');
                }
                return;
            }

            const k = parseInt(card.dataset.key);
            const res = await new Promise((resolve) => chrome.storage.local.get(['rotationKeys'], resolve));
            const rotationKeys = Array.isArray(res.rotationKeys) ? res.rotationKeys.map(String) : [];
            const ks = String(k);
            let updated;
            let nowIncluded;
            if (rotationKeys.includes(ks)) {
                updated = rotationKeys.filter(x => x !== ks);
                nowIncluded = false;
                includeBtn.classList.remove('included');
                includeBtn.innerHTML = '<span class="random-icon">✗</span>';
                showPush('Removed from random selection', 'success');
            } else {
                updated = rotationKeys.concat([ks]);
                nowIncluded = true;
                includeBtn.classList.add('included');
                includeBtn.innerHTML = '<span class="random-icon">✓</span>';
                showPush('Added to random selection', 'success');
            }
            chrome.storage.local.set({ rotationKeys: updated });
        });

        btns.appendChild(remBtn);
        btns.appendChild(includeBtn);

        card.appendChild(thumb);
        card.appendChild(btns);

        listContainer.appendChild(card);
        // Mark active card
        if (activeKey && parseInt(key) === parseInt(activeKey)) {
            card.classList.add('active');
            const btn = card.querySelector('.fav-set');
            if (btn) btn.textContent = 'Unset';
        }
        // Mark included in rotation
        (async () => {
            const res = await new Promise((resolve) => chrome.storage.local.get(['rotationKeys'], resolve));
            const rotationKeys = Array.isArray(res.rotationKeys) ? res.rotationKeys.map(String) : [];
            const ib = card.querySelector('.fav-include');
            if (ib) {
                if (rotationKeys.includes(String(key))) {
                    ib.classList.add('included');
                    ib.innerHTML = '<span class="random-icon">✓</span>';
                } else {
                    ib.classList.remove('included');
                    ib.innerHTML = '<span class="random-icon">✗</span>';
                }
                ib.removeAttribute('title');
            }
        })();
    }

    // Restore scroll position after DOM updates
    setTimeout(() => {
        if (listContainer) {
            listContainer.scrollTop = scrollPosition;
        }
    }, 0);
}
function getRotationData() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['rotationKeys', 'rotationMode', 'rotationIndex'], resolve);
    });
}

function setRotationIndex(idx) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ rotationIndex: idx }, resolve);
    });
}

// PUSH WARNING - Function defined in short.js
// showPush() is defined globally in short.js and available here

// Function to hide push notification
function hidePush() {
    const push = document.getElementById('push-container');
    if (!push) return;
    push.classList.remove('show');
    push.classList.add('hide');
}

// Add click handler for close button
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.querySelector('.push-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hidePush();
        });
    }

    // Display extension version from manifest
    // const versionElement = document.getElementById('app-version');
    // if (versionElement) {
    //     const manifestData = chrome.runtime.getManifest();
    //     versionElement.textContent = `Wallsflow New Tab V${manifestData.version}`;
    // }
});

// PUSH WARNING

// Retrieve favicons at size 32x32 using urls provided by the topSites api
function faviconURL(u) {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', u); // this encodes the URL as well
    url.searchParams.set('size', '32');
    return url.toString();
}

// Format the hostnames of the topSites to be more easily readable
function getFormattedName(hostname) {
    if (/^[0-9.]+$/.test(hostname)) {
        return hostname;
    } else {
        let name = hostname.replace(/^www\./, '');
        const parts = name.split('.');
        name = parts.slice(0, -1).join('.');
        return name;
    }
}

const search_input = document.getElementById('searchInput');
const search_trigger = document.getElementById('searchTrigger');

search_trigger.addEventListener('click', function () {
    const query = search_input.value;
    if (query !== "") {
        chrome.search.query({ text: query }, function () {
            // Nu trebuie să mai redirecționezi manual, chrome.search.query() va utiliza motorul implicit
        });
    } else {
        search_input.setAttribute("placeholder", "Enter something to search");
        setTimeout(() => {
            search_input.setAttribute("placeholder", "Search");
        }, 2000);
    }
});

// Permite căutarea și prin apăsarea tastei Enter
search_input.addEventListener('keyup', function (event) {
    if (event.key === 'Enter') {
        search_trigger.click();
    }
});

// Create the menu for users to add and manage their uploaded videos
function createManager() {
    // Intercept all links to handle them via JavaScript (hides URL preview)
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && (link.closest('#LogoContainer') || link.closest('#shortcuts-container'))) {
            e.preventDefault();
            const href = link.getAttribute('href');
            const target = link.getAttribute('target') || '_self';
            if (href) {
                window.open(href, target);
            }
        }
    }, true);

    // Also handle mouse over to prevent showing URL in status bar
    document.addEventListener('mouseover', (e) => {
        const link = e.target.closest('a');
        if (link && (link.closest('#LogoContainer') || link.closest('#shortcuts-container'))) {
            // This prevents the URL from being shown in Chrome's status bar
            e.preventDefault();
        }
    }, true);

    const videoFile = document.getElementById('add_video_file');
    const openClose = document.getElementById('open_close');
    const gear = document.getElementById('gear');
    const sideNav = document.getElementById('mySidenav');
    const overlay = document.getElementById('side-blur-overlay');

    // Handle logo click (no link preview shown)
    const logoLink = document.getElementById('logo-link');
    if (logoLink) {
        logoLink.addEventListener('click', () => {
            window.open('https://abdullrahman-abdullah.github.io/Reson/', '_blank');
        });
        // Also allow keyboard navigation
        logoLink.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                window.open('https://abdullrahman-abdullah.github.io/Reson/', '_blank');
            }
        });
    }

    if (videoFile) videoFile.addEventListener('click', () => getVideo('file'));

    // Manage open/close with robust outside-click handling using capture
    let outsideHandler = null;

    // Config: adjust delay if you want trailing effect (e.g. 60). 0 = perfect sync
    const PANEL_ANIMATION_DELAY = 0;
    // مستمع واحد للحدث
    document.addEventListener('keydown', (e) => {
        if (e.key === 'p' && e.ctrlKey && e.altKey  || e.key === 'ح' && e.ctrlKey && e.altKey) {
            const currentStatus = sideNav.getAttribute('status');

            if (currentStatus === 'closed') {
                openClose.style.display = 'block'; // Ensure button is visible after closing
                openClose.style.transform = 'translateX(350px) scale(.95)';
                openClose.style.transition = 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.5s ease';
                openSide();
                sideNav.setAttribute('status', 'open');
            } else if (currentStatus === 'open') {
                closeSide();
                sideNav.setAttribute('status', 'closed');
                openClose.style.display = 'none'; // Hide the button after closing
            }
        }
    });

    function openSide() {
        if (sideNav.getAttribute('status') === 'open') return;
        // Prepare classes for animation sync
        sideNav.classList.remove('closing');
        sideNav.classList.add('opening');
        if (PANEL_ANIMATION_DELAY > 0) {
            setTimeout(() => sideNav.classList.add('open'), PANEL_ANIMATION_DELAY);
        } else {
            // immediate next frame for flawless sync
            requestAnimationFrame(() => sideNav.classList.add('open'));
        }

        openClose.classList.add('active');
        openClose.style.transform = 'translateX(0px)';
        openClose.style.filter = 'opacity(1)';
        gear.style.transform = 'rotate(-180deg)';
        sideNav.setAttribute('status', 'open');
        if (overlay) overlay.classList.add('show');
        // No blur applied - keep background visible for user to see wallpaper changes
        // capture pointerdown to reliably detect clicks outside
        outsideHandler = function (ev) {
            // if pointerdown happened inside the sideNav or on the openClose control, ignore
            if (sideNav.contains(ev.target) || openClose.contains(ev.target)) return;
            closeSide();
        };
        document.addEventListener('pointerdown', outsideHandler, { capture: true });
    }

    function closeSide() {
        if (sideNav.getAttribute('status') === 'closed') return;
        gear.style.transform = 'rotate(0deg)';
        sideNav.setAttribute('status', 'closed');
        openClose.style.display = 'none';
        // Animate out
        sideNav.classList.remove('opening', 'open');
        sideNav.classList.add('closing');
        // After transition cleanup inline styles for button
        const cleanup = () => {
            sideNav.classList.remove('closing');
            sideNav.removeEventListener('transitionend', cleanup);
        };
        sideNav.addEventListener('transitionend', cleanup);
        openClose.classList.remove('active');
        openClose.style.transform = 'translateX(350px) scale(.95)';
        openClose.style.filter = 'opacity(0.6)';
        if (overlay) overlay.classList.remove('show');
        // No blur removal needed since no blur is applied
        if (outsideHandler) {
            document.removeEventListener('pointerdown', outsideHandler, { capture: true });
            outsideHandler = null;
        }
    }

    // toggle button
    openClose.addEventListener('click', (e) => {
        e.stopPropagation();
        const status = sideNav.getAttribute('status');
        if (status === 'closed') openSide();
        else closeSide();
    });

    // overlay click closes
    if (overlay) overlay.addEventListener('click', (e) => { e.stopPropagation(); closeSide(); });

    // New Visibility Settings Popup System
    const visibilityBtn = document.getElementById('visibility-settings-btn');
    const visibilityPopup = document.getElementById('visibility-popup');

    if (visibilityBtn && visibilityPopup) {
        // Toggle popup visibility
        visibilityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            visibilityPopup.classList.toggle('show');
            visibilityBtn.classList.toggle('active');
        });

        // Close popup when clicking outside
        document.addEventListener('click', (e) => {
            if (!visibilityBtn.contains(e.target) && !visibilityPopup.contains(e.target)) {
                visibilityPopup.classList.remove('show');
                visibilityBtn.classList.remove('active');
            }
        });

        // Initialize visibility states from localStorage
        const targets = {
            'search': { element: document.getElementById('searchBar'), storageKey: 'searchHidden' },
            'shortcuts': { element: document.getElementById('shortcuts-container'), storageKey: 'shortcutsHidden' },
            'music': { element: document.getElementById('music-widget'), storageKey: 'musicHidden' },
            'greeting': { element: document.getElementById('greeting-container'), storageKey: 'greetingHidden' },
            'logo': { element: document.getElementById('LogoContainer'), storageKey: 'logoHidden' },
            'todoList': { element: document.getElementById('todo-widget'), storageKey: 'todoListHidden' },
            'todoShort': { element: document.getElementById('todo-short'), storageKey: 'todoShortHidden' },
            'notes': { element: document.getElementById('notes-widget'), storageKey: 'notesHidden' },
            'time': { element: document.getElementById('time-widget'), storageKey: 'timeHidden' },
            'date': { element: document.getElementById('date-widget'), storageKey: 'dateHidden' },
        };

        // Setup initial states for each visibility item
        const visibilityItems = visibilityPopup.querySelectorAll('.visibility-item');
        visibilityItems.forEach(item => {
            const target = item.getAttribute('data-target');
            const config = targets[target];

            if (!config) return;

            // Initialize from localStorage
            const isHidden = localStorage.getItem(config.storageKey) === 'true';
            if (!isHidden && config.element) {
                item.classList.add('active');
                config.element.classList.remove('hide');
                config.element.classList.remove('hidden-final');
            } else if (config.element) {
                item.classList.remove('active');
                config.element.classList.add('hide');
                config.element.classList.add('hidden-final');
            }

            // Handle toggle switch click
            item.addEventListener('click', (e) => {
                e.stopPropagation();

                // Don't allow interaction with disabled items
                if (item.classList.contains('disabled')) return;

                item.classList.toggle('active');
                const isNowActive = item.classList.contains('active');

                if (config.element) {
                    if (isNowActive) {
                        // Show element
                        config.element.classList.remove('hidden-final');
                        void config.element.offsetWidth; // Force layout
                        config.element.classList.remove('hide');
                        config.element.classList.remove('auto-fade-out');
                        localStorage.setItem(config.storageKey, 'false');
                    } else {
                        // Hide element
                        config.element.classList.add('hide');
                        config.element.classList.remove('auto-fade-out');
                        localStorage.setItem(config.storageKey, 'true');

                        // If hiding music widget, stop any playing music
                        if (target === 'music') {
                            stopMusic();
                        }

                        setTimeout(() => {
                            if (config.element.classList.contains('hide')) {
                                config.element.classList.add('hidden-final');
                            }
                        }, 520);
                    }
                }
            });
        });
    }
}

const sites_div = document.getElementById('tile_group');

updateVideo();
createManager();
// Note: updateVideo() will populate settings on load; no duplicate call here

// -------- Music Player functionality --------
// Global music player variables
let currentPlayer = null;
let playerContainer = null;
let activeSounds = new Map(); // Track active sounds with their audio objects

// Get saved playlists from localStorage
async function getSavedPlaylists() {
    try {
        const data = localStorage.getItem('wf_saved_playlists');
        return data ? JSON.parse(data) : [];
    } catch (err) {
        console.error('Error loading saved playlists:', err);
        return [];
    }
}

// Save playlists to localStorage
async function savePlaylists(playlists) {
    try {
        localStorage.setItem('wf_saved_playlists', JSON.stringify(playlists));
    } catch (err) {
        console.error('Error saving playlists:', err);
    }
}

// Refresh and display saved playlists
async function refreshSavedPlaylists() {
    const grid = document.getElementById('user-playlist-grid');
    const title = document.getElementById('my-playlists-title');

    if (!grid) return;

    const playlists = await getSavedPlaylists();
    grid.innerHTML = '';

    if (playlists.length === 0) {
        if (title) title.style.display = 'none';
        return;
    }

    if (title) title.style.display = 'block';

    playlists.forEach((playlist, index) => {
        const card = document.createElement('div');
        card.className = 'saved-playlist-card';
        card.dataset.playlistId = playlist.id;

        const iconMap = {
            'spotify': '🎵',
            'apple': '🎶',
            'soundcloud': '☁️',
            'youtube': '▶️',
            'tidal': '🎼',
            'amazon': '🎧'
        };

        let icon = '🎵';
        const urlLower = playlist.url.toLowerCase();
        for (const [service, serviceIcon] of Object.entries(iconMap)) {
            if (urlLower.includes(service)) {
                icon = serviceIcon;
                break;
            }
        }

        card.innerHTML = `
            <div class="saved-playlist-menu">
                <button class="saved-playlist-menu-btn">⋮</button>
                <div class="saved-playlist-menu-dropdown">
                    <button class="saved-playlist-edit" data-id="${playlist.id}">
                        ✏️ Edit
                    </button>
                    <button class="saved-playlist-delete" data-id="${playlist.id}">
                        🗑️ Delete
                    </button>
                </div>
            </div>
            <div class="saved-playlist-icon">${icon}</div>
            <div class="saved-playlist-info">
                <div class="saved-playlist-name">${playlist.name}</div>
                <div class="saved-playlist-url">${new URL(playlist.url).hostname}</div>
            </div>
        `;

        // Menu toggle functionality
        const menuBtn = card.querySelector('.saved-playlist-menu-btn');
        const menuDropdown = card.querySelector('.saved-playlist-menu-dropdown');

        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other menus
            document.querySelectorAll('.saved-playlist-menu-dropdown.show').forEach(menu => {
                if (menu !== menuDropdown) menu.classList.remove('show');
            });
            menuDropdown.classList.toggle('show');
        });

        // Click on card to play (except menu)
        card.addEventListener('click', (e) => {
            // Don't play if clicking menu or dropdown
            if (e.target.closest('.saved-playlist-menu')) return;

            // Check if this exact card is already playing
            const isCurrentlyPlaying = card.classList.contains('playing');

            // If already playing, do nothing (let it continue)
            if (isCurrentlyPlaying) {
                return;
            }

            // Switch to this playlist (will stop current player if different)
            // Remove playing state from all cards
            document.querySelectorAll('.saved-playlist-card.playing').forEach(c => {
                c.classList.remove('playing');
            });

            // Remove playing state from preset playlists too
            document.querySelectorAll('.playlist-card.playing').forEach(c => {
                c.classList.remove('playing');
            });

            // Add playing state to this card
            card.classList.add('playing');

            // Play the playlist
            if (globalPlayMusic) {
                globalPlayMusic(playlist.url);
            } else {
                showPush('Music player not ready. Please refresh.', 'default');
            }
            const musicUrlInput = document.getElementById('music-url-input');
            if (musicUrlInput) musicUrlInput.value = playlist.url;
        });

        // Edit button
        card.querySelector('.saved-playlist-edit').addEventListener('click', (e) => {
            e.stopPropagation();
            menuDropdown.classList.remove('show');
            editPlaylist(playlist, index);
        });

        // Delete button
        card.querySelector('.saved-playlist-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            menuDropdown.classList.remove('show');
            deletePlaylist(index);
        });

        grid.appendChild(card);
    });
}

// Edit playlist with modal
async function editPlaylist(playlist, index) {
    const editBackdrop = document.getElementById('playlist-edit-backdrop');
    const editInput = document.getElementById('playlist-edit-input');
    const editClose = document.getElementById('playlist-edit-close');
    const editCancel = document.getElementById('playlist-edit-cancel');
    const editSave = document.getElementById('playlist-edit-save');

    if (!editBackdrop || !editInput) return;

    // Show modal
    editBackdrop.classList.add('show');
    editInput.value = playlist.name;
    editInput.focus();
    editInput.select();

    // Close handlers
    const closeModal = () => {
        editBackdrop.classList.remove('show');
        // Remove event listeners to prevent memory leaks
        editClose.onclick = null;
        editCancel.onclick = null;
        editSave.onclick = null;
        editInput.onkeypress = null;
    };

    editClose.onclick = closeModal;
    editCancel.onclick = closeModal;

    // Save handler
    const handleSave = async () => {
        const newName = editInput.value.trim();
        if (!newName) {
            showPush('Please enter a playlist name', 'default');
            return;
        }

        const playlists = await getSavedPlaylists();
        playlists[index].name = newName;
        await savePlaylists(playlists);
        refreshSavedPlaylists();
        closeModal();
        showPush('✅ Playlist updated!', 'success');
    };

    editSave.onclick = handleSave;

    // Allow Enter key to save
    editInput.onkeypress = (e) => {
        if (e.key === 'Enter') handleSave();
    };
}

// Delete playlist with modal
async function deletePlaylist(index) {
    const deleteBackdrop = document.getElementById('playlist-delete-backdrop');
    const deleteClose = document.getElementById('playlist-delete-close');
    const deleteCancel = document.getElementById('playlist-delete-cancel');
    const deleteConfirm = document.getElementById('playlist-delete-confirm');

    if (!deleteBackdrop) return;

    // Show modal
    deleteBackdrop.classList.add('show');

    // Close handlers
    const closeModal = () => {
        deleteBackdrop.classList.remove('show');
        // Remove event listeners to prevent memory leaks
        deleteClose.onclick = null;
        deleteCancel.onclick = null;
        deleteConfirm.onclick = null;
    };

    deleteClose.onclick = closeModal;
    deleteCancel.onclick = closeModal;

    // Delete handler
    const handleDelete = async () => {
        const playlists = await getSavedPlaylists();
        playlists.splice(index, 1);
        await savePlaylists(playlists);
        refreshSavedPlaylists();
        closeModal();
        showPush('✅ Playlist deleted!', 'success');
    };

    deleteConfirm.onclick = handleDelete;
}

// Global event listeners for modal backdrop clicks
document.addEventListener('click', (e) => {
    const editBackdrop = document.getElementById('playlist-edit-backdrop');
    const deleteBackdrop = document.getElementById('playlist-delete-backdrop');

    // Close edit modal if clicking on backdrop
    if (e.target === editBackdrop && editBackdrop.classList.contains('show')) {
        editBackdrop.classList.remove('show');
    }

    // Close delete modal if clicking on backdrop
    if (e.target === deleteBackdrop && deleteBackdrop.classList.contains('show')) {
        deleteBackdrop.classList.remove('show');
    }

    // Close all dropdown menus when clicking outside
    if (!e.target.closest('.saved-playlist-menu')) {
        document.querySelectorAll('.saved-playlist-menu-dropdown.show').forEach(menu => {
            menu.classList.remove('show');
        });
    }
});

function stopMusic() {
    if (currentPlayer && playerContainer) {
        // Clear saved position when manually stopping
        localStorage.removeItem('wf_music_position');

        playerContainer.innerHTML = '';
        playerContainer.classList.remove('active');
        currentPlayer = null;

        // Reset playlist visual states
        const playlistCards = document.querySelectorAll('.playlist-card');
        playlistCards.forEach(card => card.classList.remove('playing'));

        // Check if we should remove music button animation
        checkMusicButtonAnimation();

        // showPush('Music stopped', 'success'); // Removed to reduce notification spam
    }
}

// Extract playlist name from various music service URLs
function extractPlaylistName(url) {
    try {
        url = url.trim();

        // Spotify Playlist URL
        // https://open.spotify.com/playlist/6wdPoBQJJueo68bJv1CIVr?si=...
        if (url.includes('spotify.com/playlist/')) {
            // Call Spotify API to get playlist name (requires API key)
            // For now, return null and we'll try to extract from embed or metadata
            return extractSpotifyPlaylistName(url);
        }

        // Apple Music URL
        // https://music.apple.com/us/playlist/...
        if (url.includes('music.apple.com')) {
            const match = url.match(/playlist\/([a-zA-Z0-9._-]+)/);
            if (match) return decodeURIComponent(match[1]);
        }

        // SoundCloud URL
        // https://soundcloud.com/user/sets/playlist-name or /playlists/123456
        if (url.includes('soundcloud.com')) {
            // Extract from path
            const parts = url.split('/');
            const lastPart = parts[parts.length - 1];
            if (lastPart) {
                return decodeURIComponent(lastPart.split('?')[0]);
            }
        }

        // YouTube Music Playlist
        // https://music.youtube.com/playlist?list=PLxxxxxx
        if (url.includes('music.youtube.com/playlist')) {
            const match = url.match(/list=([A-Za-z0-9_-]+)/);
            if (match) return 'YouTube Playlist: ' + match[1];
        }

        // YouTube Playlist
        // https://www.youtube.com/playlist?list=PLxxxxxx
        if (url.includes('youtube.com/playlist') || url.includes('youtu.be')) {
            const match = url.match(/list=([A-Za-z0-9_-]+)/);
            if (match) return 'YouTube Playlist: ' + match[1];
        }

        // Tidal Playlist
        // https://tidal.com/browse/playlist/...
        if (url.includes('tidal.com')) {
            const parts = url.split('/');
            const lastPart = parts[parts.length - 1];
            if (lastPart) {
                return 'Tidal: ' + decodeURIComponent(lastPart.split('?')[0]);
            }
        }

        // Amazon Music
        // https://music.amazon.com/playlists/...
        if (url.includes('amazon.com')) {
            const match = url.match(/playlists\/([a-zA-Z0-9._-]+)/);
            if (match) return 'Amazon Music: ' + decodeURIComponent(match[1]);
        }

        return null;
    } catch (err) {
        console.error('Error extracting playlist name:', err);
        return null;
    }
}

// Extract Spotify playlist name from URL (using CORS-free method)
function extractSpotifyPlaylistName(url) {
    try {
        const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
        if (match) {
            const playlistId = match[1];
            // Fetch metadata using Spotify's open.spotify.com embed endpoint
            fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`)
                .then(res => res.json())
                .then(data => {
                    if (data.title) {
                        localStorage.setItem('wf_music_name', data.title);
                    }
                })
                .catch(err => console.log('Could not fetch Spotify playlist name:', err));

            // Return generic name for now
            return 'Spotify Playlist';
        }
    } catch (err) {
        console.error('Error extracting Spotify playlist name:', err);
    }
    return null;
}

// Global reference to playMusic function (will be set by initMusicPlayer)
let globalPlayMusic = null;

function initMusicPlayer() {
    const musicWidgetBtn = document.getElementById('music-widget-btn');
    const musicPanel = document.getElementById('music-widget-panel');
    const musicModalBackdrop = document.getElementById('music-modal-backdrop');
    const musicPanelClose = document.getElementById('music-panel-close');
    const musicUrlInput = document.getElementById('music-url-input');
    const playBtn = document.getElementById('music-play-btn');
    const stopBtn = document.getElementById('music-stop-btn');
    playerContainer = document.getElementById('music-player-container');
    const customMusicSection = document.getElementById('custom-music-section');

    let isPanelOpen = false;

    // Custom playlists feature is now free for all users
    const hasCustomPlaylists = true;

    // Preset buttons functionality
    const presetButtons = document.querySelectorAll('.music-preset-btn');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-url');
            const name = btn.getAttribute('data-name');

            // Update input and play
            if (musicUrlInput) musicUrlInput.value = url;
            localStorage.setItem('wf_music_url', url);
            playMusic(url);

            // Visual feedback
            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // showPush(`🎵 Playing ${name}`, 'success'); // Reduced notification spam
        });
    });

    // Load saved URL but DON'T auto-play on page load
    const savedUrl = localStorage.getItem('wf_music_url');
    if (savedUrl) {
        if (musicUrlInput) musicUrlInput.value = savedUrl;

        // Check if saved URL is from presets and mark as active
        const presetUrls = Array.from(presetButtons).map(btn => btn.getAttribute('data-url'));
        const isPresetUrl = presetUrls.includes(savedUrl);

        if (isPresetUrl) {
            // Visual feedback for preset buttons only (no auto-play)
            presetButtons.forEach(btn => {
                if (btn.getAttribute('data-url') === savedUrl) {
                    btn.classList.add('active');
                }
            });
        }

        // Removed auto-play to prevent animation on page load
        // User must manually click play
    }

    // Toggle modal
    const toggleModal = () => {
        isPanelOpen = !isPanelOpen;
        if (isPanelOpen) {
            musicModalBackdrop.classList.add('show');
            musicPanel.classList.add('show');
            // Auto-focus input when opening (only if has custom playlists feature)
            if (hasCustomPlaylists && musicUrlInput) {
                setTimeout(() => musicUrlInput.focus(), 300);
            }
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
        } else {
            musicModalBackdrop.classList.remove('show');
            musicPanel.classList.remove('show');
            // Restore body scroll
            document.body.style.overflow = '';
        }
    };

    if (musicWidgetBtn) musicWidgetBtn.onclick = toggleModal;

    // Close modal
    musicPanelClose.onclick = () => {
        isPanelOpen = false;
        musicModalBackdrop.classList.remove('show');
        musicPanel.classList.remove('show');
        document.body.style.overflow = '';
    };

    // Click outside to close - using backdrop
    if (musicModalBackdrop) {
        musicModalBackdrop.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target === musicModalBackdrop) {
                isPanelOpen = false;
                musicModalBackdrop.classList.remove('show');
                musicPanel.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    }

    // Play music
    playBtn.onclick = () => {
        const url = musicUrlInput.value.trim();
        if (!url) {
            showPush('Please paste a Spotify or SoundCloud URL', 'default');
            return;
        }

        // Check if URL is from preset buttons
        const presetUrls = Array.from(presetButtons).map(btn => btn.getAttribute('data-url'));
        const isPresetUrl = presetUrls.includes(url);

        // Extract playlist name from URL and save it
        const playlistName = extractPlaylistName(url);
        if (playlistName) {
            localStorage.setItem('wf_music_name', playlistName);
        }

        localStorage.setItem('wf_music_url', url);
        playMusic(url);
    };

    // Enter key to play music
    if (musicUrlInput) {
        musicUrlInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                playBtn.click();
            }
        });

        // Live playlist name display as user types/pastes URL
        musicUrlInput.addEventListener('input', (e) => {
            const url = e.target.value.trim();
            const playlistNameDisplay = document.getElementById('playlist-name-display');

            if (!playlistNameDisplay) return;

            if (!url) {
                playlistNameDisplay.textContent = '';
                return;
            }

            const playlistName = extractPlaylistName(url);
            if (playlistName) {
                playlistNameDisplay.textContent = '📌 ' + playlistName;
            } else {
                playlistNameDisplay.textContent = '';
            }
        });
    }

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isPanelOpen) {
            isPanelOpen = false;
            musicModalBackdrop.classList.remove('show');
            musicPanel.classList.remove('show');
            document.body.style.overflow = '';
        }
    });

    // Stop music
    stopBtn.onclick = stopMusic;

    // Save playlist button
    const saveBtn = document.getElementById('music-save-btn');
    if (saveBtn) {
        saveBtn.onclick = async () => {
            const url = musicUrlInput.value.trim();
            const playlistName = extractPlaylistName(url);

            if (!url) {
                showPush('Please paste a playlist URL first', 'default');
                return;
            }

            // Get saved playlists
            const savedPlaylists = await getSavedPlaylists();
            if (savedPlaylists.length >= 6) {
                showPush('❌ Maximum 6 playlists reached. Delete one to add more.', 'default');
                return;
            }

            // Save new playlist
            const newPlaylist = {
                id: Date.now(),
                name: playlistName || 'Untitled Playlist',
                url: url,
                dateAdded: new Date().toLocaleString()
            };

            savedPlaylists.push(newPlaylist);
            await savePlaylists(savedPlaylists);

            // Clear input
            musicUrlInput.value = '';
            document.getElementById('playlist-name-display').textContent = '';

            // Refresh list
            refreshSavedPlaylists();
            showPush('✅ Playlist saved!', 'success');
        };
    }

    // Load saved playlists on init
    refreshSavedPlaylists();

    function playMusic(url) {
        // Detect platform and create embed
        if (url.includes('soundcloud.com')) {
            playSoundCloud(url);
        } else if (url.includes('spotify.com')) {
            playSpotify(url);
        } else {
            showPush('Only Spotify and SoundCloud URLs are supported', 'default');
            return;
        }

        // Add playing animation to music button
        const musicBtn = document.querySelector('.music-widget-btn');
        if (musicBtn) {
            musicBtn.classList.add('playing');
        }
    }

    // Set global reference to playMusic for use in saved playlists
    globalPlayMusic = playMusic;

    function playMusicWithUserGesture(url) {
        // Create audio context to enable autoplay after user gesture
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
        } catch (e) {
            // Audio context not supported, proceed anyway
        }

        // Call regular playMusic function
        playMusic(url);
    }

    function playSpotify(url) {
        console.log('playSpotify called with:', url);

        // Don't call stopMusic() - just replace the player directly
        // Clear the container and replace with new player

        // Extract Spotify embed URL with enhanced autoplay parameters
        let embedUrl = '';
        if (url.includes('playlist/')) {
            const playlistId = url.match(/playlist\/([a-zA-Z0-9]+)/)?.[1];
            embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0&autoplay=1&auto_play=true&show_artwork=true&color=%23ffffff&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true`;
        } else if (url.includes('track/')) {
            const trackId = url.match(/track\/([a-zA-Z0-9]+)/)?.[1];
            embedUrl = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0&autoplay=1&auto_play=true&show_artwork=true&color=%23ffffff&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true`;
        } else if (url.includes('album/')) {
            const albumId = url.match(/album\/([a-zA-Z0-9]+)/)?.[1];
            embedUrl = `https://open.spotify.com/embed/album/${albumId}?utm_source=generator&theme=0&autoplay=1&auto_play=true&show_artwork=true&color=%23ffffff&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true`;
        }

        if (!embedUrl) {
            showPush('Invalid Spotify URL', 'default');
            return;
        }

        const iframe = document.createElement('iframe');
        iframe.src = embedUrl;
        iframe.width = '100%';
        iframe.height = '152';
        iframe.frameBorder = '0';
        iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; accelerometer; gyroscope';
        iframe.loading = 'eager';
        iframe.id = 'spotify-player';
        iframe.sandbox = 'allow-same-origin allow-scripts allow-popups allow-forms allow-presentation';

        playerContainer.innerHTML = '';
        playerContainer.appendChild(iframe);
        playerContainer.classList.add('active');
        currentPlayer = iframe;

        console.log('✅ Spotify player loaded');
        showPush('🎵 Spotify player loaded', 'success');

        // Try to trigger autoplay after iframe loads
        iframe.addEventListener('load', () => {
            setTimeout(() => {
                // Simulate click to trigger autoplay (works around browser restrictions)
                try {
                    const clickEvent = new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    });
                    iframe.dispatchEvent(clickEvent);
                    console.log('🎵 Spotify autoplay triggered');
                } catch (err) {
                    console.log('Autoplay blocked by browser policy');
                }
            }, 500);

            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (iframeDoc) {
                    // Override console error logging to prevent AbortError from showing
                    iframe.contentWindow.addEventListener('error', (event) => {
                        if (event.message && event.message.includes('AbortError')) {
                            event.preventDefault();
                        }
                    }, true);
                }
            } catch (err) {
                // Ignore cross-origin errors
            }
        });

        // Try to trigger autoplay after iframe loads
        iframe.onload = () => {
            // Create a temporary overlay to simulate user interaction
            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.background = 'transparent';
            overlay.style.zIndex = '999';
            overlay.style.cursor = 'pointer';

            playerContainer.style.position = 'relative';
            playerContainer.appendChild(overlay);

            // Auto-click the overlay after a longer delay for initial load
            // First attempt with longer delay (1000ms for first time, 400ms for subsequent)
            const initialDelay = localStorage.getItem('spotify_player_initialized') ? 400 : 1000;

            setTimeout(() => {
                try {
                    // Method 1: Create and dispatch programmatic click with user gesture
                    const event = new PointerEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        pointerId: 1,
                        width: 1,
                        height: 1,
                        pressure: 0.5,
                        detail: 1
                    });
                    overlay.dispatchEvent(event);

                    // Method 2: Focus iframe and send play commands
                    iframe.focus();
                    iframe.contentWindow.postMessage('PLAY', '*');
                    iframe.contentWindow.postMessage({ type: 'PLAY' }, '*');

                    // Method 3: Try Spotify-specific postMessage commands
                    iframe.contentWindow.postMessage({
                        command: 'play',
                        uri: url
                    }, 'https://open.spotify.com');

                    // Method 4: Progressive enhancement - try after delays
                    [300, 800, 1500].forEach(delay => {
                        setTimeout(() => {
                            try {
                                iframe.contentWindow.postMessage('TOGGLE_PLAY', '*');
                            } catch (err) {
                                // Silently ignore errors from iframe communication
                            }
                        }, delay);
                    });

                    // Mark Spotify player as initialized
                    localStorage.setItem('spotify_player_initialized', 'true');

                    // Remove overlay after attempts
                    setTimeout(() => {
                        try {
                            if (overlay && overlay.parentNode) {
                                overlay.remove();
                            }
                        } catch (err) {
                            // Silently ignore removal errors
                        }
                    }, 2500);

                } catch (e) {
                    console.log('Autoplay initialization completed with error handling');
                }
            }, initialDelay);
        };

        // Show helpful message for first-time users
        if (!localStorage.getItem('spotify_autoplay_info_shown')) {
            setTimeout(() => {
                showPush('💡 If music doesn\'t start automatically, click the play button in the Spotify player', 'default');
                localStorage.setItem('spotify_autoplay_info_shown', 'true');
            }, 3000);
        }
    }

    function playSoundCloud(url) {
        console.log('playSoundCloud called with:', url);

        // Don't call stopMusic() - just replace the player directly

        // Validate SoundCloud URL
        if (!url.includes('soundcloud.com')) {
            showPush('❌ Invalid SoundCloud URL', 'default');
            return;
        }

        // Initialize player immediately (API is optional)
        initSoundCloudPlayer(url);
    }

    function initSoundCloudPlayer(url) {
        console.log('Initializing SoundCloud player with URL:', url);

        // Clear previous player
        playerContainer.innerHTML = '';

        // SoundCloud embed iframe - works WITHOUT the API
        const iframe = document.createElement('iframe');
        iframe.id = 'soundcloud-widget';
        iframe.width = '100%';
        iframe.height = '166';
        iframe.frameBorder = '0';
        iframe.scrolling = 'no';
        iframe.allow = 'autoplay';
        iframe.setAttribute('loading', 'eager');

        // SoundCloud embed URL with proper parameters
        const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff5500&auto_play=true&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true`;

        iframe.src = embedUrl;
        console.log('SoundCloud embed URL:', embedUrl);

        playerContainer.appendChild(iframe);
        playerContainer.classList.add('active');
        currentPlayer = iframe;

        showPush('🎵 SoundCloud player loaded - Click ▶ to play', 'success');
    }

    function attachWidgetListeners(iframe) {
        try {
            const widget = window.SC.Widget(iframe);

            widget.bind(window.SC.Widget.Events.READY, () => {
                console.log('✅ SoundCloud widget ready');

                // Try autoplay (browser may block it)
                widget.play();
                console.log('Autoplay attempted');
            });

            widget.bind(window.SC.Widget.Events.PLAY, () => {
                console.log('✅ SoundCloud is playing');
            });

            widget.bind(window.SC.Widget.Events.PAUSE, () => {
                console.log('⏸️ SoundCloud paused');
            });

            widget.bind(window.SC.Widget.Events.FINISH, () => {
                console.log('✅ Track finished');
            });

            widget.bind(window.SC.Widget.Events.ERROR, () => {
                console.error('❌ SoundCloud playback error');
            });
        } catch (error) {
            console.warn('⚠️ Widget API error (player still works):', error);
        }
    }

    // ============= NEW TAB SYSTEM =============

    // Tab functionality
    const tabBtns = document.querySelectorAll('.music-tab-btn');
    const tabContents = document.querySelectorAll('.music-tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Allow access to My Playlist Plus tab for all users (upgrade message shown inside)

            // Update active tab
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(targetTab + '-tab').classList.add('active');
        });
    });

    // Sound cards functionality
    const soundCards = document.querySelectorAll('.sound-card');

    soundCards.forEach(card => {
        const soundType = card.getAttribute('data-sound');
        const volumeSlider = card.querySelector('.sound-volume');

        // Get the actual audio file from data-file attribute
        const audioFile = card.getAttribute('data-file');
        const soundUrl = audioFile ? `../audio/${audioFile}` : null;

        // Click on entire card to play/stop
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on volume slider
            if (e.target.classList.contains('sound-volume')) return;

            if (activeSounds.has(soundType)) {
                // Stop sound
                const audio = activeSounds.get(soundType);
                audio.pause();
                audio.currentTime = 0;
                activeSounds.delete(soundType);

                // Aggressive visual reset - multiple methods to ensure it works
                card.classList.remove('playing', 'loading');

                // Force inline styles to override any persistent CSS
                card.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                card.style.background = 'rgba(26, 32, 44, 0.8)';
                card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                card.style.animation = 'none';

                // Reset icon styles too
                const icon = card.querySelector('.sound-icon');
                if (icon) {
                    icon.style.transform = 'scale(1)';
                    icon.style.filter = 'none';
                }

                // Force reflow
                card.offsetHeight;

                console.log('Stopped sound:', soundType, 'Card reset with inline styles');

                // Check if any sounds are still playing
                if (activeSounds.size === 0) {
                    const musicBtn = document.querySelector('.music-widget-btn');
                    if (musicBtn) {
                        musicBtn.classList.remove('playing');
                    }
                }

                showPush(`${card.getAttribute('data-name')} stopped`, 'default');
            } else {
                // Play sound
                if (!soundUrl) {
                    showPush('Audio file not found', 'default');
                    return;
                }

                const audio = new Audio(soundUrl);
                audio.loop = true; // Loop ambient sounds
                audio.volume = volumeSlider.value / 100;

                // Flag to track if this is the first play (not a loop repeat)
                let isFirstPlay = true;

                audio.addEventListener('loadstart', () => {
                    // Clear any inline styles before setting loading state
                    card.style.borderColor = '';
                    card.style.background = '';
                    card.style.boxShadow = '';
                    card.style.animation = '';
                    const icon = card.querySelector('.sound-icon');
                    if (icon) {
                        icon.style.transform = '';
                        icon.style.filter = '';
                    }
                    card.classList.add('loading');
                });

                audio.addEventListener('canplaythrough', () => {
                    card.classList.remove('loading');
                    card.classList.add('playing');

                    // Add playing animation to music button
                    const musicBtn = document.querySelector('.music-widget-btn');
                    if (musicBtn) {
                        musicBtn.classList.add('playing');
                    }

                    // Show notification only on first play, not on repeat loops
                    if (isFirstPlay) {
                        showPush(`${card.getAttribute('data-name')} playing`, 'default');
                        isFirstPlay = false; // Set flag to false after first play
                    }
                });

                audio.addEventListener('error', (err) => {
                    console.error('Audio loading error:', err);
                    // Restore normal appearance on error
                    card.classList.remove('loading', 'playing');
                    showPush(`Could not load ${card.getAttribute('data-name')}`, 'default');
                });

                // Start playing
                audio.play().then(() => {
                    activeSounds.set(soundType, audio);
                }).catch((err) => {
                    console.error('Audio play error:', err);
                    // Restore normal appearance on play error
                    card.classList.remove('loading', 'playing');
                    showPush(`Could not play ${card.getAttribute('data-name')}`, 'default');
                });
            }
        });

        // Volume control
        volumeSlider.addEventListener('input', () => {
            if (activeSounds.has(soundType)) {
                const audio = activeSounds.get(soundType);
                audio.volume = volumeSlider.value / 100;
            }
        });
    });

    // Playlist cards functionality
    const playlistCards = document.querySelectorAll('.playlist-card');

    playlistCards.forEach(card => {
        // Add click event to the entire card
        card.addEventListener('click', (e) => {
            const url = card.getAttribute('data-url');
            const name = card.getAttribute('data-name');

            // Check if this exact card is already playing
            const isCurrentlyPlaying = card.classList.contains('playing');

            // If already playing, do nothing (let it continue)
            if (isCurrentlyPlaying) {
                return;
            }

            // Switch to this playlist (will stop current player if different)
            // Stop any ambient sounds first
            stopAllAmbientSounds();

            // Update input and play
            if (musicUrlInput) musicUrlInput.value = url;
            localStorage.setItem('wf_music_url', url);

            // Store user interaction flag for autoplay
            window.userInteracted = true;

            // Play the music with user interaction context
            playMusicWithUserGesture(url);

            // Visual feedback - remove playing from ALL cards (including saved playlists)
            document.querySelectorAll('.playlist-card.playing').forEach(c => {
                c.classList.remove('playing');
            });
            document.querySelectorAll('.saved-playlist-card.playing').forEach(c => {
                c.classList.remove('playing');
            });

            card.classList.add('playing');
        });
    });

    // Helper functions for ambient sounds
    function createAmbientSound(type) {
        return new Promise((resolve) => {
            // For demo purposes, create a simple looping sound
            // In production, you would load actual audio files
            const audio = new Audio();

            // Demo URLs - replace with actual ambient sound files
            const demoUrls = {
                'rain': 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBzKR2e7Wpzb/xJA=',
                'ocean': 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBzKR2e7Wpzb/xJA=',
                'cafe': 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBzKR2e7Wpzb/xJA='
            };

            // Create a simple audio context for demo
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                // Configure based on sound type
                switch (type) {
                    case 'rain':
                        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
                        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                        break;
                    case 'ocean':
                        oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
                        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                        break;
                    default:
                        oscillator.frequency.setValueAtTime(150, audioContext.currentTime);
                        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                }

                oscillator.type = 'brown';
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                // Create a mock audio object for consistency
                const mockAudio = {
                    play: () => oscillator.start(),
                    pause: () => oscillator.stop(),
                    volume: 0.5,
                    loop: true
                };

                resolve(mockAudio);
            } catch (error) {
                console.warn('Web Audio API not supported, using fallback');
                resolve(null);
            }
        });
    }

    function stopAllAmbientSounds() {
        activeSounds.forEach((audio, soundType) => {
            audio.pause();
            const card = document.querySelector(`[data-sound="${soundType}"]`);
            if (card) {
                // Aggressive visual reset for stopAll function too
                card.classList.remove('playing', 'loading');

                // Force inline styles to override persistent CSS
                card.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                card.style.background = 'rgba(26, 32, 44, 0.8)';
                card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
                card.style.animation = 'none';

                // Reset icon styles
                const icon = card.querySelector('.sound-icon');
                if (icon) {
                    icon.style.transform = 'scale(1)';
                    icon.style.filter = 'none';
                }

                console.log('Stopped ambient sound with reset:', soundType);
            }
        });
        activeSounds.clear();

        // Check if we should remove music button animation
        checkMusicButtonAnimation();
    }

    // Helper function to manage music button animation state
    function checkMusicButtonAnimation() {
        const musicBtn = document.querySelector('.music-widget-btn');
        if (!musicBtn) return;

        // Check if any music is playing (either streaming or ambient sounds)
        const hasActiveStreaming = currentPlayer && playerContainer && playerContainer.classList.contains('active');
        const hasActiveSounds = activeSounds.size > 0;

        if (hasActiveStreaming || hasActiveSounds) {
            musicBtn.classList.add('playing');
        } else {
            musicBtn.classList.remove('playing');
        }
    }
}

// Initialize music player on load
document.addEventListener('DOMContentLoaded', () => {
    initMusicPlayer();

    // Force music button to be transparent on page load (no animation)
    setTimeout(() => {
        const musicBtn = document.querySelector('.music-widget-btn');
        if (musicBtn) {
            musicBtn.classList.remove('playing');
            // Reset any variables that might trigger animation
            currentPlayer = null;
            activeSounds.clear();

            // Ensure player container is also reset
            const container = document.querySelector('.music-player-container');
            if (container) {
                container.classList.remove('active');
                container.innerHTML = '';
            }
        }
    }, 100);
});

// NOTE: showToast() and hideToast() have been consolidated into showPush() for unified notifications

// In updateSettings or wherever a card is added:

// -------- Management Buttons Functionality --------
document.addEventListener('DOMContentLoaded', function () {
    // Initialize video playback state
    initVideoPlaybackState();

    // Initialize management buttons
    const wallpapersBtn = document.getElementById('wallpapers-btn');
    const widgetsBtn = document.getElementById('widgets-btn');
    const wallpapersSection = document.getElementById('wallpapers-section');
    const widgetsSection = document.getElementById('widgets-section');

    // Handle management button clicks
    function switchSection(activeBtn, inactiveBtn, activeSection, inactiveSection) {
        // Update button states
        activeBtn.classList.add('active');
        inactiveBtn.classList.remove('active');

        // Update section visibility
        activeSection.classList.add('active');
        inactiveSection.classList.remove('active');
    }

    if (wallpapersBtn && widgetsBtn && wallpapersSection && widgetsSection) {
        wallpapersBtn.addEventListener('click', () => {
            switchSection(wallpapersBtn, widgetsBtn, wallpapersSection, widgetsSection);
        });

        widgetsBtn.addEventListener('click', () => {
            switchSection(widgetsBtn, wallpapersBtn, widgetsSection, wallpapersSection);
        });

        // Initialize widget toggle functionality
        initializeWidgetToggles().then(() => {
            // Initialize widget visibility on page load after toggles are set up
            initializeWidgetVisibility();
        });
    }
});

// Initialize widget toggle switches
async function initializeWidgetToggles() {
    const widgetItems = document.querySelectorAll('.simple-widget-item');

    // Initialize each widget state
    for (const item of widgetItems) {
        const toggle = item.querySelector('.simple-toggle-switch');
        const target = item.getAttribute('data-target');

        if (toggle && target) {
            // Initialize switch state based on localStorage and premium status
            await initializeWidgetState(item, toggle, target);

            toggle.addEventListener('click', (e) => {
                e.stopPropagation();

                // Check if this is a disabled premium widget
                if (item.classList.contains('disabled')) {
                    const isPremium = item.getAttribute('data-premium') === 'true';
                    if (isPremium) {
                        showPremiumModal();
                    }
                    return;
                }

                item.classList.toggle('active');
                const isNowActive = item.classList.contains('active');

                // Update toggle switch state
                updateToggleState(toggle, isNowActive);

                // Handle widget visibility logic (reuse existing logic)
                handleWidgetToggle(target, isNowActive);
            });

            // Also allow clicking the entire item
            item.addEventListener('click', () => {
                if (item.classList.contains('disabled')) {
                    const isPremium = item.getAttribute('data-premium') === 'true';
                    if (isPremium) {
                        showPremiumModal();
                    }
                } else {
                    toggle.click();
                }
            });
        }
    }
}

// Initialize widget state from localStorage
async function initializeWidgetState(item, toggle, target) {
    const storageKeys = {
        search: 'searchHidden',
        shortcuts: 'shortcutsHidden',
        music: 'musicHidden',
        greeting: 'greetingHidden',
        logo: 'logoHidden',
        todoList: 'todoListHidden',
        todoShort: 'todoShortHidden',
        notes: 'notesHidden',
        time: 'timeHidden',
        date: 'dateHidden',
        'video-playback': 'videoPlaybackEnabled'
    };

    const storageKey = storageKeys[target];
    if (!storageKey) return;

    // Special logic for video-playback (enabled by default, stored as enabled state)
    let isActive;
    if (target === 'video-playback') {
        const videoEnabled = localStorage.getItem(storageKey);
        isActive = videoEnabled === null ? true : videoEnabled === 'true'; // Default to enabled
    } else {
        // Normal widgets: check if hidden (default is shown)
        const isHidden = localStorage.getItem(storageKey) === 'true';
        isActive = !isHidden; // Active means visible
    }

    // Set initial states on UI
    if (isActive) {
        item.classList.add('active');
        toggle.classList.add('active');
    } else {
        item.classList.remove('active');
        toggle.classList.remove('active');
    }

    // Also apply visibility classes to the actual element
    const targetElements = {
        search: document.getElementById('searchBar'),
        shortcuts: document.getElementById('shortcuts-container'),
        music: document.getElementById('music-widget'),
        greeting: document.getElementById('greeting-container'),
        logo: document.getElementById('LogoContainer'),
        todoList: document.getElementById('draggableTodo'),
        todoShort: document.getElementById('todo-short'),
        notes: document.getElementById('notes-widget'),
        time: document.getElementById('time-widget'),
        date: document.getElementById('date-widget'),
    };

    const element = targetElements[target];
    if (element) {
        if (isActive) {
            element.classList.remove('hidden-final');
            element.classList.remove('hide');
        } else {
            element.classList.add('hidden-final');
            element.classList.add('hide');
        }
    }
}

// Update toggle switch visual state
function updateToggleState(toggle, isActive) {
    if (isActive) {
        toggle.classList.add('active');
    } else {
        toggle.classList.remove('active');
    }
}

// Handle widget toggle logic (reuse existing visibility logic)
function handleWidgetToggle(target, isActive) {
    const configs = {
        search: {
            element: document.getElementById('searchBar'),
            storageKey: 'searchHidden',
            label: 'Search bar'
        },
        shortcuts: {
            element: document.getElementById('shortcuts-container'),
            storageKey: 'shortcutsHidden',
            label: 'Shortcuts'
        },
        music: {
            element: document.getElementById('music-widget'),
            storageKey: 'musicHidden',
            label: 'Music player'
        },
        greeting: {
            element: document.getElementById('greeting-container'),
            storageKey: 'greetingHidden',
            label: 'Greeting'
        },
        logo: {
            element: document.getElementById('LogoContainer'),
            storageKey: 'logoHidden',
            label: 'Logo'
        },
        todoList: {
            element: document.getElementById('draggableTodo'),
            storageKey: 'todoListHidden',
            label: 'To-Do List'
        },
        todoShort: {
            element: document.getElementById('todo-short'),
            storageKey: 'todoShortHidden',
            label: 'To-Do Shortcut'
        },
        notes: {
            element: document.getElementById('notes-widget'),
            storageKey: 'notesHidden',
            label: 'Notes'
        },
        time: {
            element: document.getElementById('time-widget'),
            storageKey: 'timeHidden',
            label: 'Time'
        },
        date: {
            element: document.getElementById('date-widget'),
            storageKey: 'dateHidden',
            label: 'Date'
        },


    };

    // Special handling for video playback control
    if (target === 'video-playback') {
        handleVideoPlaybackToggle(isActive, true);
        return;
    }

    const config = configs[target];
    if (!config || !config.element) return;

    if (isActive) {
        // Show element
        config.element.classList.remove('hidden-final');
        void config.element.offsetWidth; // Force layout
        config.element.classList.remove('hide');
        config.element.classList.remove('auto-fade-out');
        localStorage.setItem(config.storageKey, 'false');

        // Show notification
        showPush(`${config.label} enabled`, 'default');

        // Special handling for music
        if (target === 'music') {
            config.element.style.display = 'block';
        }
    } else {
        // Hide element
        config.element.classList.add('hide');
        config.element.classList.remove('auto-fade-out');
        localStorage.setItem(config.storageKey, 'true');

        // Show notification
        showPush(`${config.label} disabled`, 'default');

        // Special handling for music - stop music if hiding
        if (target === 'music') {
            stopMusic();
            setTimeout(() => {
                config.element.style.display = 'none';
            }, 500);
        } else {
            setTimeout(() => {
                config.element.classList.add('hidden-final');
            }, 500);
        }
    }
}

// Initialize widget visibility on page load
function initializeWidgetVisibility() {
    const configs = {
        search: {
            element: document.getElementById('searchBar'),
            storageKey: 'searchHidden'
        },
        shortcuts: {
            element: document.getElementById('shortcuts-container'),
            storageKey: 'shortcutsHidden'
        },
        music: {
            element: document.getElementById('music-widget'),
            storageKey: 'musicHidden'
        },
        greeting: {
            element: document.getElementById('greeting-container'),
            storageKey: 'greetingHidden'
        },
        logo: {
            element: document.getElementById('LogoContainer'),
            storageKey: 'logoHidden'
        },
        todoList: {
            element: document.getElementById('draggableTodo'),
            storageKey: 'todoListHidden'
        },
        todoShort: {
            element: document.getElementById('todo-short'),
            storageKey: 'todoShortHidden'
        },
        notes: {
            element: document.getElementById('notes-widget'),
            storageKey: 'notesHidden'
        },
        time: {
            element: document.getElementById('time-widget'),
            storageKey: 'timeHidden'
        },
        date: {
            element: document.getElementById('date-widget'),
            storageKey: 'dateHidden'
        },


    };

    // Check each widget's visibility state from localStorage
    Object.keys(configs).forEach(target => {
        const config = configs[target];
        if (!config || !config.element) return;

        const isHidden = localStorage.getItem(config.storageKey) === 'true';

        if (isHidden) {
            // Hide the element immediately
            config.element.classList.add('hide');

            // Special handling for music
            if (target === 'music') {
                config.element.style.display = 'none';
            } else {
                setTimeout(() => {
                    config.element.classList.add('hidden-final');
                }, 100); // Small delay to ensure proper hiding
            }
        } else {
            // Ensure element is visible
            config.element.classList.remove('hide');
            config.element.classList.remove('hidden-final');

            if (target === 'music') {
                config.element.style.display = 'block';
            }
        }
    });
}

// Old showPremiumModal removed - now using showUpgradeModal() with license keys

// ========================================
// Review Request System
// ========================================

function initReviewSystem() {
    const reviewBackdrop = document.getElementById('review-modal-backdrop');
    const reviewCloseBtn = document.getElementById('review-modal-close');
    const reviewLeaveBtn = document.getElementById('review-btn-leave');
    const reviewLaterBtn = document.getElementById('review-btn-later');

    if (!reviewBackdrop) return;

    // Check if user has already submitted a review - never show again
    const reviewSubmitted = localStorage.getItem('reviewSubmitted');
    if (reviewSubmitted === 'true') {
        return;
    }

    const firstTabOpenTime = parseInt(localStorage.getItem('firstTabOpenTime') || Date.now());
    const daysSinceFirstOpen = (Date.now() - firstTabOpenTime) / (1000 * 60 * 60 * 24);

    // Check if user clicked "Maybe later" or X and if 2 days have passed
    const reviewLaterTimestamp = parseInt(localStorage.getItem('reviewLaterTimestamp') || '0');
    const daysSinceLater = reviewLaterTimestamp ? (Date.now() - reviewLaterTimestamp) / (1000 * 60 * 60 * 24) : 999;

    // Check user engagement - only show if they have custom wallpapers (shows they're actively using)
    countLiveWallpapers().then((wallpaperCount) => {
        const hasCustomWallpapers = wallpaperCount > 0;

        // Show review prompt if:
        // 1. User hasn't submitted a review yet
        // 2. User has opened new tab at least 3 days ago
        // 3. If "Later" or X was clicked, 2 days must have passed
        // 4. User has added at least one custom wallpaper (engagement indicator)
        if (daysSinceFirstOpen >= 3 && daysSinceLater >= 2 && hasCustomWallpapers) {
            // Show after a delay (2 seconds)
            setTimeout(() => {
                showReviewModal();
            }, 2000);
        }
    });

    function showReviewModal() {
        reviewBackdrop.classList.add('show');
    }

    function closeReviewModal() {
        reviewBackdrop.classList.remove('show');
    }

    // Close button
    if (reviewCloseBtn) {
        reviewCloseBtn.addEventListener('click', () => {
            closeReviewModal();
            // Set timestamp for later - will show again after 2 days
            localStorage.setItem('reviewLaterTimestamp', Date.now().toString());
        });
    }

    // Leave review button - Opens Chrome Web Store or Edge Add-ons
    if (reviewLeaveBtn) {
        reviewLeaveBtn.addEventListener('click', () => {
            const extensionId = chrome.runtime.id;

            // Detect if running on Edge
            const isEdge = navigator.userAgent.indexOf('Edg') !== -1;

            let reviewUrl;
            if (isEdge) {
                // Edge Add-ons review page
                reviewUrl = `https://microsoftedge.microsoft.com/addons/detail/${extensionId}`;
            } else {
                // Chrome Web Store review page
                reviewUrl = `https://chrome.google.com/webstore/detail/${extensionId}/reviews`;
            }

            window.open(reviewUrl, '_blank');

            closeReviewModal();
            // Mark that user has submitted a review - never show again
            localStorage.setItem('reviewSubmitted', 'true');
            showPush('Thank you for your review! ⭐', 'default');
        });
    }

    // Later button
    if (reviewLaterBtn) {
        reviewLaterBtn.addEventListener('click', () => {
            closeReviewModal();
            // Set timestamp for "later" - will show again after 2 days
            localStorage.setItem('reviewLaterTimestamp', Date.now().toString());
        });
    }

    // Backdrop click does nothing - modal only closes via X button
    reviewBackdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        // Removed backdrop click close functionality
    });
}

// Initialize review system when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Store first tab open time if not already set
    if (!localStorage.getItem('firstTabOpenTime')) {
        localStorage.setItem('firstTabOpenTime', Date.now().toString());
    }

    // Store first extension open time if not already set (for donation button)
    if (!localStorage.getItem('firstExtensionOpenTime')) {
        localStorage.setItem('firstExtensionOpenTime', Date.now().toString());
    }

    initReviewSystem();

    // Download More Wallpapers button handler
    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            chrome.tabs.create({
                url: 'https://motionbgs.com/'
            });
        });
    }

    // Support Button handler (Buy Coffee)
    const supportBtn = document.getElementById('support-btn');
    if (supportBtn) {
        const firstExtensionOpenTime = parseInt(localStorage.getItem('firstExtensionOpenTime') || Date.now());
        const daysSinceFirstOpen = (Date.now() - firstExtensionOpenTime) / (1000 * 60 * 60 * 24);

        // Check if user has donated and when
        const lastDonationTime = parseInt(localStorage.getItem('lastDonationTime') || '0');
        const daysSinceLastDonation = lastDonationTime > 0 ? (Date.now() - lastDonationTime) / (1000 * 60 * 60 * 24) : 999;

        // Show button if:
        // 1. User has been using extension for at least 5 days
        // 2. User hasn't donated OR donated more than 30 days ago
        const shouldShow = (daysSinceFirstOpen >= 5) && (lastDonationTime === 0 || daysSinceLastDonation >= 30);

        console.log('Support Button Debug:', {
            firstExtensionOpenTime,
            daysSinceFirstOpen,
            lastDonationTime,
            daysSinceLastDonation,
            shouldShow
        });

        if (shouldShow) {
            supportBtn.style.display = 'flex';
        } else {
            supportBtn.style.display = 'none';
        }

        supportBtn.addEventListener('click', () => {
            const donationUrl = 'https://wa.me/+963981082693';
            chrome.tabs.create({ url: donationUrl });

            // Save donation timestamp and hide button
            localStorage.setItem('lastDonationTime', Date.now().toString());
            supportBtn.style.display = 'none';

            showPush('Thank you for your support! ☕❤️', 'success');
        });
    }
});

// ==============================
// Simple Greeting (No Clock)
// ==============================
document.addEventListener('DOMContentLoaded', () => {
    const greetingText = document.getElementById('greeting-text');
    const greetingSubtitle = document.getElementById('greeting-subtitle');

    if (!greetingText || !greetingSubtitle) return;

    const hour = new Date().getHours();
    let greeting, subtitle;

    if (hour >= 5 && hour < 12) {
        greeting = "Good Morning";
        subtitle = "Start your day with inspiration!";
    } else if (hour >= 12 && hour < 17) {
        greeting = "Good Afternoon";
        subtitle = "Hope your day is going well!";
    } else if (hour >= 17 && hour < 22) {
        greeting = "Good Evening";
        subtitle = "Time to relax and unwind!";
    } else {
        greeting = "Good Night";
        subtitle = "Sweet dreams await you!";
    }

    greetingText.textContent = greeting;
    greetingSubtitle.textContent = subtitle;
});

// ==============================
// Performance Optimization: Pause video when tab is hidden
// ==============================
document.addEventListener('visibilitychange', () => {
    const backgroundDiv = document.getElementById('background');
    if (!backgroundDiv) return;

    const videoElement = backgroundDiv.querySelector('video');
    if (!videoElement) return;

    if (document.hidden) {
        // Tab hidden - pause video to save resources
        videoElement.pause();
    } else {
        // Tab visible - resume video only if animation is enabled
        const isPlaybackEnabled = localStorage.getItem('videoPlaybackEnabled') !== 'false';
        if (isPlaybackEnabled) {
            videoElement.play().catch(err => console.log('Video resume prevented:', err));
        }
    }
});

