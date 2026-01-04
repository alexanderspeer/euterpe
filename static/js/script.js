// Global state
let selectedTimeRange = 'medium_term';
let currentSection = 'overview';

// Window dragging and resizing state
let dragState = null;
let resizeState = null;

// Track open windows
let openWindows = new Map();
let windowCounter = 0;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    initializeWindowControls();
});

/**
 * Initialize the application
 */
function initializeApp() {
    // Store section templates before any windows are closed
    storeSectionTemplates();
    setupNavigation();
    setupTimeRangeControls();
    loadOverviewData();
    
    // Initial update of navigation button states (overview should be bold since main window exists)
    updateNavigationButtonStates();
}

/**
 * Store section templates in a hidden container for reuse
 */
function storeSectionTemplates() {
    const mainWindow = document.querySelector('.main-content-window');
    if (!mainWindow) return;
    
    const templateContainer = document.getElementById('section-templates');
    if (!templateContainer) return;
    
    // Get all sections from the main window
    const sections = mainWindow.querySelectorAll('.content-section');
    sections.forEach(section => {
        // Clone and store in template container
        const template = section.cloneNode(true);
        template.id = `template-${section.id}`;
        template.classList.remove('active');
        templateContainer.appendChild(template);
    });
}

/**
 * Initialize window dragging and resizing
 */
function initializeWindowControls() {
    const windows = document.querySelectorAll('.window');
    
    windows.forEach(window => {
        setupWindowControls(window);
    });
    
    // Global mouse move and up handlers
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

/**
 * Setup controls for a single window
 */
function setupWindowControls(window) {
    // Make window draggable via title bar
    const titleBar = window.querySelector('.title-bar');
    if (titleBar) {
        titleBar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.title-bar-controls')) return;
            startDrag(window, e);
        });
    }
    
    // Setup close button
    const closeButton = window.querySelector('.title-bar-controls button[aria-label="Close"]');
    if (closeButton) {
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            closeWindow(window);
        });
    }
    
    // Setup minimize button
    const minimizeButton = window.querySelector('.title-bar-controls button[aria-label="Minimize"]');
    if (minimizeButton) {
        minimizeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            // If maximized, restore it. Otherwise, do nothing (or could implement actual minimize)
            if (window.dataset.maximized === 'true') {
                restoreWindow(window);
            }
        });
    }
    
    // Setup maximize button
    const maximizeButton = window.querySelector('.title-bar-controls button[aria-label="Maximize"]');
    if (maximizeButton) {
        maximizeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            // Only maximize if not already maximized
            if (window.dataset.maximized !== 'true') {
                maximizeWindow(window);
            }
        });
    }
    
    // Make window resizable via resize handles
    const resizeHandles = window.querySelectorAll('.resize-handle');
    resizeHandles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            // Don't allow resizing if maximized
            if (window.dataset.maximized === 'true') return;
            startResize(window, handle, e);
        });
    });
    
    // Bring window to front on click (but not on buttons or interactive elements)
    window.addEventListener('mousedown', (e) => {
        // Don't bring to front if clicking on buttons, inputs, or other interactive elements
        if (e.target.tagName === 'BUTTON' || 
            e.target.tagName === 'INPUT' || 
            e.target.closest('button') || 
            e.target.closest('input') ||
            e.target.closest('.nav-button')) {
            return;
        }
        bringToFront(window);
    });
}

/**
 * Start dragging a window
 */
function startDrag(window, e) {
    // Get current computed position (relative to app-container)
    const currentLeft = parseInt(getComputedStyle(window).left) || 0;
    const currentTop = parseInt(getComputedStyle(window).top) || 0;
    
    dragState = {
        window: window,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: currentLeft,
        startTop: currentTop
    };
    window.classList.add('dragging');
    bringToFront(window);
}

/**
 * Start resizing a window
 */
function startResize(window, handle, e) {
    const rect = window.getBoundingClientRect();
    const handleClass = handle.className.split(' ').find(c => c !== 'resize-handle');
    
    resizeState = {
        window: window,
        handle: handleClass,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: rect.width,
        startHeight: rect.height,
        startLeft: rect.left,
        startTop: rect.top
    };
    window.classList.add('resizing');
    bringToFront(window);
}

/**
 * Handle mouse move for dragging and resizing
 */
function handleMouseMove(e) {
    if (dragState) {
        const deltaX = e.clientX - dragState.startX;
        const deltaY = e.clientY - dragState.startY;
        
        let newLeft = dragState.startLeft + deltaX;
        let newTop = dragState.startTop + deltaY;
        
        // Allow window to go partially off-screen, but keep at least part visible
        // Use viewport dimensions since windows can now extend beyond app-container
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const windowWidth = dragState.window.offsetWidth;
        const windowHeight = dragState.window.offsetHeight;
        
        // Minimum visible area (keep at least 50px of the window visible)
        const minVisible = 50;
        
        // Calculate bounds: allow going off-screen but keep minimum visible
        const minLeft = -(windowWidth - minVisible);
        const maxLeft = viewportWidth - minVisible;
        const minTop = -(windowHeight - minVisible);
        const maxTop = viewportHeight - minVisible;
        
        newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
        newTop = Math.max(minTop, Math.min(newTop, maxTop));
        
        dragState.window.style.left = newLeft + 'px';
        dragState.window.style.top = newTop + 'px';
    }
    
    if (resizeState) {
        const deltaX = e.clientX - resizeState.startX;
        const deltaY = e.clientY - resizeState.startY;
        
        let newWidth = resizeState.startWidth;
        let newHeight = resizeState.startHeight;
        let newLeft = resizeState.startLeft;
        let newTop = resizeState.startTop;
        
        const minWidth = 200;
        const minHeight = 150;
        const maxWidth = window.innerWidth - 20;
        const maxHeight = window.innerHeight - 20;
        
        // Handle different resize directions
        if (resizeState.handle.includes('e')) {
            newWidth = Math.min(maxWidth, Math.max(minWidth, resizeState.startWidth + deltaX));
        }
        if (resizeState.handle.includes('w')) {
            const widthChange = resizeState.startWidth - deltaX;
            if (widthChange >= minWidth && resizeState.startLeft + deltaX >= 0) {
                newWidth = Math.min(maxWidth, widthChange);
                newLeft = resizeState.startLeft + deltaX;
            }
        }
        if (resizeState.handle.includes('s')) {
            newHeight = Math.min(maxHeight, Math.max(minHeight, resizeState.startHeight + deltaY));
        }
        if (resizeState.handle.includes('n')) {
            const heightChange = resizeState.startHeight - deltaY;
            if (heightChange >= minHeight && resizeState.startTop + deltaY >= 0) {
                newHeight = Math.min(maxHeight, heightChange);
                newTop = resizeState.startTop + deltaY;
            }
        }
        
        resizeState.window.style.width = newWidth + 'px';
        resizeState.window.style.height = newHeight + 'px';
        if (newLeft !== resizeState.startLeft) {
            resizeState.window.style.left = newLeft + 'px';
        }
        if (newTop !== resizeState.startTop) {
            resizeState.window.style.top = newTop + 'px';
        }
    }
}

/**
 * Handle mouse up to stop dragging/resizing
 */
function handleMouseUp() {
    if (dragState) {
        dragState.window.classList.remove('dragging');
        dragState = null;
    }
    if (resizeState) {
        resizeState.window.classList.remove('resizing');
        resizeState = null;
    }
}

/**
 * Bring window to front
 */
function bringToFront(window) {
    const windows = document.querySelectorAll('.window');
    let maxZ = 1;
    windows.forEach(w => {
        const z = parseInt(getComputedStyle(w).zIndex) || 1;
        if (z > maxZ) maxZ = z;
    });
    window.style.zIndex = maxZ + 1;
}

/**
 * Maximize a window to fill available space (excluding navigation window)
 */
function maximizeWindow(window) {
    // Don't maximize the sidebar window
    if (window.classList.contains('sidebar-window')) {
        return;
    }
    
    // Store original position and size
    const originalLeft = parseInt(getComputedStyle(window).left) || 0;
    const originalTop = parseInt(getComputedStyle(window).top) || 0;
    const originalWidth = parseInt(getComputedStyle(window).width) || window.offsetWidth;
    const originalHeight = parseInt(getComputedStyle(window).height) || window.offsetHeight;
    
    window.dataset.originalLeft = originalLeft.toString();
    window.dataset.originalTop = originalTop.toString();
    window.dataset.originalWidth = originalWidth.toString();
    window.dataset.originalHeight = originalHeight.toString();
    
    // Get app container dimensions
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    
    const containerRect = appContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Find sidebar window to calculate available space
    const sidebarWindow = document.querySelector('.sidebar-window');
    let sidebarRight = 0;
    const padding = 16; // Space around the maximized window
    
    if (sidebarWindow) {
        const sidebarRect = sidebarWindow.getBoundingClientRect();
        const sidebarLeft = parseInt(getComputedStyle(sidebarWindow).left) || 0;
        sidebarRight = sidebarLeft + sidebarRect.width;
    }
    
    // Calculate maximized dimensions
    // Start after sidebar + padding, fill rest minus padding on all sides
    const maxLeft = sidebarRight + padding;
    const maxTop = padding;
    const maxWidth = containerWidth - maxLeft - padding;
    const maxHeight = containerHeight - (padding * 2);
    
    // Apply maximized size and position
    window.style.left = maxLeft + 'px';
    window.style.top = maxTop + 'px';
    window.style.width = maxWidth + 'px';
    window.style.height = maxHeight + 'px';
    
    // Mark as maximized
    window.dataset.maximized = 'true';
    
    bringToFront(window);
}

/**
 * Restore a window to its original size and position
 */
function restoreWindow(window) {
    // Restore original position and size
    const originalLeft = window.dataset.originalLeft;
    const originalTop = window.dataset.originalTop;
    const originalWidth = window.dataset.originalWidth;
    const originalHeight = window.dataset.originalHeight;
    
    if (originalLeft !== undefined) {
        window.style.left = originalLeft + 'px';
    }
    if (originalTop !== undefined) {
        window.style.top = originalTop + 'px';
    }
    if (originalWidth !== undefined) {
        window.style.width = originalWidth + 'px';
    }
    if (originalHeight !== undefined) {
        window.style.height = originalHeight + 'px';
    }
    
    // Remove maximized flag
    window.dataset.maximized = 'false';
    
    bringToFront(window);
}

/**
 * Close a window
 */
function closeWindow(window) {
    const windowId = window.dataset.windowId;
    if (windowId && openWindows.has(windowId)) {
        openWindows.delete(windowId);
    }
    window.remove();
    updateNavigationButtonStates();
}

/**
 * Update navigation button states based on open windows
 */
function updateNavigationButtonStates() {
    // Get all navigation buttons
    const navButtons = document.querySelectorAll('.nav-button');
    
    navButtons.forEach(button => {
        const sectionId = button.dataset.section;
        if (!sectionId) return;
        
        // Check if a window exists for this section
        let windowExists = false;
        
        // For overview, check if main-content-window exists
        if (sectionId === 'overview') {
            const mainWindow = document.querySelector('.main-content-window');
            windowExists = mainWindow !== null;
        } else {
            // For other sections, check if a window with this section exists
            const sectionWindow = document.querySelector(`.window[data-section="${sectionId}"]`);
            windowExists = sectionWindow !== null;
        }
        
        // Update button style using the active class (which makes it bold)
        if (windowExists) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

/**
 * Open a new window for a section
 */
function openWindowForSection(sectionId) {
    // Check if window already exists for this section
    const existingWindow = document.querySelector(`.window[data-section="${sectionId}"]`);
    if (existingWindow) {
        bringToFront(existingWindow);
        return;
    }
    
    // Get section title
    const sectionTitles = {
        'overview': 'Overview',
        'top-tracks': 'Top Tracks',
        'top-artists': 'Top Artists',
        'top-albums': 'Top Albums',
        'playlists': 'Top Playlists',
        'hidden-gems': 'Hidden Gems',
        'timeless-artists': 'Timeless Artists',
        'trending-down': 'Trending Down',
        'release-trends': 'Release Trends',
        'seasonal-variety': 'Seasonal Variety'
    };
    
    const title = sectionTitles[sectionId] || sectionId;
    
    // Try to get section from main window first, then from templates
    let sectionElement = null;
    const mainWindow = document.querySelector('.main-content-window');
    if (mainWindow) {
        sectionElement = mainWindow.querySelector(`#${sectionId}`);
    }
    
    // If not found in main window, get from template container
    if (!sectionElement) {
        const templateContainer = document.getElementById('section-templates');
        if (templateContainer) {
            const template = templateContainer.querySelector(`#template-${sectionId}`);
            if (template) {
                sectionElement = template;
            }
        }
    }
    
    if (!sectionElement) {
        console.error(`Section ${sectionId} not found in main window or templates`);
        return;
    }
    
    // Create new window
    const newWindow = document.createElement('div');
    newWindow.className = 'window';
    newWindow.dataset.section = sectionId;
    newWindow.dataset.windowId = `window-${++windowCounter}`;
    
    // Calculate position (diagonal offset from existing windows)
    const existingWindows = document.querySelectorAll('.window:not(.sidebar-window)');
    const windowCount = existingWindows.length;
    const diagonalOffset = 40; // Offset for diagonal pattern
    
    newWindow.style.width = '600px';
    newWindow.style.height = '500px';
    newWindow.style.top = `${100 + (diagonalOffset * windowCount)}px`;
    newWindow.style.left = `${350 + (diagonalOffset * windowCount)}px`;
    
    // Clone section content
    const clonedSection = sectionElement.cloneNode(true);
    clonedSection.classList.add('active');
    clonedSection.id = `${sectionId}-${windowCounter}`;
    
    // Create window structure
    newWindow.innerHTML = `
        <div class="title-bar">
            <div class="title-bar-text">${title}</div>
            <div class="title-bar-controls">
                <button aria-label="Minimize"></button>
                <button aria-label="Maximize"></button>
                <button aria-label="Close"></button>
            </div>
        </div>
        <div class="resize-handle n"></div>
        <div class="resize-handle s"></div>
        <div class="resize-handle e"></div>
        <div class="resize-handle w"></div>
        <div class="resize-handle ne"></div>
        <div class="resize-handle nw"></div>
        <div class="resize-handle se"></div>
        <div class="resize-handle sw"></div>
        <div class="window-body"></div>
    `;
    
    // Add cloned content to window body
    const windowBody = newWindow.querySelector('.window-body');
    windowBody.appendChild(clonedSection);
    
    // Add to DOM
    const appContainer = document.querySelector('.app-container');
    appContainer.appendChild(newWindow);
    
    // Setup controls
    setupWindowControls(newWindow);
    
    // Track window
    openWindows.set(newWindow.dataset.windowId, newWindow);
    
    // Bring to front
    bringToFront(newWindow);
    
    // Update IDs in cloned content to be unique
    updateClonedContentIds(clonedSection, windowCounter);
    
    // Load section data after a brief delay to ensure DOM is ready
    setTimeout(() => {
        loadSectionData(sectionId, newWindow);
    }, 10);
    
    // Update navigation button states
    updateNavigationButtonStates();
}

/**
 * Update IDs in cloned content to be unique
 */
function updateClonedContentIds(element, counter) {
    // Update all IDs in the cloned element
    const elementsWithIds = element.querySelectorAll('[id]');
    elementsWithIds.forEach(el => {
        if (el.id) {
            el.id = `${el.id}-${counter}`;
        }
    });
    
    // Update any references to IDs in for attributes
    const labelsWithFor = element.querySelectorAll('label[for]');
    labelsWithFor.forEach(label => {
        if (label.getAttribute('for')) {
            label.setAttribute('for', `${label.getAttribute('for')}-${counter}`);
        }
    });
    
    // Update any input IDs that labels reference
    const inputsWithId = element.querySelectorAll('input[id]');
    inputsWithId.forEach(input => {
        if (input.id) {
            input.id = `${input.id}-${counter}`;
        }
    });
}

/**
 * Setup navigation event listeners
 */
function setupNavigation() {
    // Use event delegation on the app container to handle nav buttons
    const appContainer = document.querySelector('.app-container');
    
    appContainer.addEventListener('click', (e) => {
        const navButton = e.target.closest('.nav-button');
        if (navButton) {
            e.preventDefault();
            e.stopPropagation();
            const section = navButton.dataset.section;
            if (section) {
                openWindowForSection(section);
            }
            return;
        }
        
        // Handle preview cards - these still switch in main window
        const previewCard = e.target.closest('.preview-card');
        if (previewCard) {
            e.preventDefault();
            e.stopPropagation();
            const section = previewCard.dataset.section;
            if (section) {
                switchSection(section);
            }
        }
    });
}

/**
 * Setup time range controls
 */
function setupTimeRangeControls() {
    const timeRangeRadios = document.querySelectorAll('input[name="time-range"]');
    
    timeRangeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const range = e.currentTarget.value;
            if (range) {
                selectTimeRange(range);
            }
        });
    });
}

/**
 * Switch between sections
 */
function switchSection(sectionId) {
    // Update navigation
    document.querySelectorAll('.nav-button').forEach(button => {
        button.classList.remove('active');
    });
    const activeButton = document.querySelector(`.nav-button[data-section="${sectionId}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
        currentSection = sectionId;
        
        // Load section data
        loadSectionData(sectionId);
    }
}

/**
 * Select time range
 */
function selectTimeRange(range) {
    selectedTimeRange = range;
    
    // Update radio button states
    const radio = document.querySelector(`input[name="time-range"][value="${range}"]`);
    if (radio) {
        radio.checked = true;
    }
    
    // Reload current section data
    loadSectionData(currentSection);
}

/**
 * Load data for specific section
 */
function loadSectionData(sectionId, targetWindow = null) {
    // Find the window containing this section
    if (!targetWindow) {
        targetWindow = document.querySelector(`.window[data-section="${sectionId}"]`) || 
                      document.querySelector('.main-content-window');
    }
    
    switch (sectionId) {
        case 'overview':
            loadOverviewData(targetWindow);
            break;
        case 'top-tracks':
            loadTopTracks(targetWindow);
            break;
        case 'top-artists':
            loadTopArtists(targetWindow);
            break;
        case 'top-albums':
            loadTopAlbums(targetWindow);
            break;
        case 'playlists':
            loadTopPlaylists(targetWindow);
            break;
        case 'hidden-gems':
            loadHiddenGems(targetWindow);
            break;
        case 'timeless-artists':
            loadTimelessArtists(targetWindow);
            break;
        case 'trending-down':
            loadTrendingDown(targetWindow);
            break;
        case 'release-trends':
            loadReleaseTrends(targetWindow);
            break;
        case 'seasonal-variety':
            loadSeasonalVariety(targetWindow);
            break;
    }
}

/**
 * Load overview data (stats + quick preview)
 */
async function loadOverviewData(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    try {
        // Load multiple endpoints in parallel for overview
        const [tracksData, artistsData, albumsData] = await Promise.all([
            fetch(`/top_songs?time_range=${selectedTimeRange}`).then(r => r.json()),
            fetch(`/top_artists?time_range=${selectedTimeRange}`).then(r => r.json()),
            fetch(`/top_albums?time_range=${selectedTimeRange}`).then(r => r.json())
        ]);

        // Find containers in target window
        const statsContainer = targetWindow.querySelector('#overview-stats') || targetWindow.querySelector('[id*="overview-stats"]');
        const cardsContainer = targetWindow.querySelector('#overview-cards') || targetWindow.querySelector('[id*="overview-cards"]');

        // Create stats
        if (statsContainer) {
            createStatsGrid([
                { label: 'Top Tracks', value: tracksData.length || 0 },
                { label: 'Top Artists', value: artistsData.length || 0 },
                { label: 'Top Albums', value: albumsData.length || 0 },
                { label: 'Time Range', value: getTimeRangeLabel(selectedTimeRange) }
            ], statsContainer);
        }

        // Create overview cards (top 6 items from each category)
        const overviewCards = [];
        
        // Add top artists
        if (artistsData && artistsData.length > 0) {
            artistsData.slice(0, 3).forEach((artist, index) => {
                overviewCards.push({
                    type: 'artist',
                    title: artist.artist_name,
                    subtitle: artist.genres && artist.genres.length > 0 ? artist.genres.slice(0, 2).join(', ') : 'Artist',
                    rank: index + 1,
                    image: artist.artist_image,
                    icon: ''
                });
            });
        }

        // Add top tracks
        if (tracksData && tracksData.length > 0) {
            tracksData.slice(0, 3).forEach((track, index) => {
                overviewCards.push({
                    type: 'track',
                    title: track.song_name,
                    subtitle: track.artists || 'Unknown Artist',
                    rank: index + 4,
                    image: track.album_image,
                    icon: ''
                });
            });
        }

        if (cardsContainer) {
            createOverviewCards(overviewCards, cardsContainer);
        }

        // Load preview data for all sections
        loadAllPreviews(tracksData, artistsData, albumsData, targetWindow);

    } catch (error) {
        console.error('Error loading overview data:', error);
        const statsContainer = targetWindow.querySelector('#overview-stats') || targetWindow.querySelector('[id*="overview-stats"]');
        const cardsContainer = targetWindow.querySelector('#overview-cards') || targetWindow.querySelector('[id*="overview-cards"]');
        if (statsContainer) showError(statsContainer, 'Failed to load overview data');
        if (cardsContainer) showError(cardsContainer, 'Failed to load overview cards');
    }
}

/**
 * Load top tracks
 */
async function loadTopTracks(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#tracks-list') || targetWindow.querySelector('[id*="tracks-list"]');
    if (!container) return;
    const tbody = container.querySelector('tbody') || container;
    showLoading(tbody);

    try {
        const response = await fetch(`/top_songs?time_range=${selectedTimeRange}`);
        const data = await response.json();

        if (data.error) {
            showError(tbody, data.error);
            return;
        }

        createTrackList(data, container);
    } catch (error) {
        console.error('Error loading top tracks:', error);
        showError(tbody, 'Failed to load top tracks');
    }
}

/**
 * Load top artists
 */
async function loadTopArtists(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#artists-grid') || targetWindow.querySelector('[id*="artists-grid"]');
    if (!container) return;
    showLoading(container);

    try {
        const response = await fetch(`/top_artists?time_range=${selectedTimeRange}`);
        const data = await response.json();

        if (data.error) {
            showError(container, data.error);
            return;
        }

        const cards = data.map((artist, index) => ({
            title: artist.artist_name,
            subtitle: artist.genres && artist.genres.length > 0 ? artist.genres.slice(0, 2).join(', ') : 'Artist',
            rank: index + 1,
            image: artist.artist_image,
            icon: ''
        }));

        createCardGrid(cards, container);
    } catch (error) {
        console.error('Error loading top artists:', error);
        showError(container, 'Failed to load top artists');
    }
}

/**
 * Load top albums
 */
async function loadTopAlbums(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#albums-grid') || targetWindow.querySelector('[id*="albums-grid"]');
    if (!container) return;
    showLoading(container);

    try {
        const response = await fetch(`/top_albums?time_range=${selectedTimeRange}`);
        const data = await response.json();

        if (data.error) {
            showError(container, data.error);
            return;
        }

        const cards = data.map((album, index) => ({
            title: album.album_name,
            subtitle: album.artists || `${album.track_count} tracks`,
            rank: index + 1,
            image: album.album_image,
            icon: ''
        }));

        createCardGrid(cards, container);
    } catch (error) {
        console.error('Error loading top albums:', error);
        showError(container, 'Failed to load top albums');
    }
}

/**
 * Load top playlists
 */
async function loadTopPlaylists(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#playlists-grid') || targetWindow.querySelector('[id*="playlists-grid"]');
    if (!container) return;
    showLoading(container);

    try {
        const response = await fetch('/top_playlists');
        const data = await response.json();

        if (data.error) {
            showError(container, data.error);
            return;
        }

        const cards = data.map((playlist, index) => ({
            title: playlist.playlist_name,
            subtitle: `${playlist.top_songs_count || 0} top songs`,
            rank: index + 1,
            icon: ''
        }));

        createCardGrid(cards, container);
    } catch (error) {
        console.error('Error loading top playlists:', error);
        showError(container, 'Failed to load top playlists');
    }
}

/**
 * Load hidden gems
 */
async function loadHiddenGems(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#hidden-gems-list') || targetWindow.querySelector('[id*="hidden-gems-list"]');
    if (!container) return;
    const tbody = container.querySelector('tbody') || container;
    showLoading(tbody);

    try {
        const response = await fetch(`/hidden_gems?time_range=${selectedTimeRange}`);
        const data = await response.json();

        if (data.error) {
            showError(tbody, data.error);
            return;
        }

        createHiddenGemsList(data, container);
    } catch (error) {
        console.error('Error loading hidden gems:', error);
        showError(tbody, 'Failed to load hidden gems');
    }
}

/**
 * Load timeless artists
 */
async function loadTimelessArtists(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#timeless-artists-grid') || targetWindow.querySelector('[id*="timeless-artists-grid"]');
    if (!container) return;
    showLoading(container);

    try {
        const response = await fetch('/artists_standing_test_of_time');
        const data = await response.json();

        if (data.error) {
            showError(container, data.error);
            return;
        }

        const cards = data.map((artist, index) => ({
            title: artist.artist_name,
            subtitle: artist.genres && artist.genres.length > 0 ? artist.genres.slice(0, 2).join(', ') : 'Timeless Artist',
            rank: index + 1,
            image: artist.artist_image,
            icon: ''
        }));

        createCardGrid(cards, container);
    } catch (error) {
        console.error('Error loading timeless artists:', error);
        showError(container, 'Failed to load timeless artists');
    }
}

/**
 * Load trending down artists
 */
async function loadTrendingDown(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#trending-down-grid') || targetWindow.querySelector('[id*="trending-down-grid"]');
    if (!container) return;
    showLoading(container);

    try {
        const response = await fetch('/artists_falling_off');
        const data = await response.json();

        if (data.error) {
            showError(container, data.error);
            return;
        }

        const cards = data.map((artist, index) => ({
            title: artist.artist_name,
            subtitle: artist.genres && artist.genres.length > 0 ? artist.genres.slice(0, 2).join(', ') : 'Trending Down',
            rank: index + 1,
            image: artist.artist_image,
            icon: ''
        }));

        createCardGrid(cards, container);
    } catch (error) {
        console.error('Error loading trending down artists:', error);
        showError(container, 'Failed to load trending down artists');
    }
}

/**
 * Load release trends
 */
async function loadReleaseTrends(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#release-trends-chart') || targetWindow.querySelector('[id*="release-trends-chart"]');
    if (!container) return;
    showLoading(container);

    try {
        const response = await fetch(`/release_year_trends?time_range=${selectedTimeRange}`);
        const data = await response.json();

        createReleaseTrendsChart(data, container);
    } catch (error) {
        console.error('Error loading release trends:', error);
        showError(container, 'Failed to load release trends');
    }
}

/**
 * Load seasonal variety
 */
async function loadSeasonalVariety(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#seasonal-variety-chart') || targetWindow.querySelector('[id*="seasonal-variety-chart"]');
    if (!container) return;
    showLoading(container);

    try {
        const response = await fetch(`/music_variety_by_season?time_range=${selectedTimeRange}`);
        const data = await response.json();

        createSeasonalVarietyChart(data, container);
    } catch (error) {
        console.error('Error loading seasonal variety:', error);
        showError(container, 'Failed to load seasonal variety');
    }
}

/**
 * Create stats grid
 */
function createStatsGrid(stats, container = null) {
    if (!container) container = document.getElementById('overview-stats');
    if (!container) return;
    container.innerHTML = '';

    stats.forEach(stat => {
        const statCard = document.createElement('div');
        statCard.className = 'stat-card';
        statCard.innerHTML = `
            <div class="stat-value">${stat.value}</div>
            <div class="stat-label">${stat.label}</div>
        `;
        container.appendChild(statCard);
    });
}

/**
 * Create overview cards
 */
function createOverviewCards(cards, container = null) {
    if (!container) container = document.getElementById('overview-cards');
    if (!container) return;
    container.innerHTML = '';

    cards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'music-card';
        
        const imageContent = card.image 
            ? `<img src="${card.image}" alt="${card.title}" style="width: 100%; height: 100%; object-fit: cover;">` 
            : card.icon;
        
        cardElement.innerHTML = `
            <div class="card-rank">${card.rank}</div>
            <div class="card-image">${imageContent}</div>
            <div class="card-title">${card.title}</div>
            <div class="card-subtitle">${card.subtitle}</div>
        `;
        container.appendChild(cardElement);
    });
}

/**
 * Create card grid
 */
function createCardGrid(cards, container) {
    container.innerHTML = '';

    cards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'music-card';
        
        const imageContent = card.image 
            ? `<img src="${card.image}" alt="${card.title}" style="width: 100%; height: 100%; object-fit: cover;">` 
            : card.icon;
        
        cardElement.innerHTML = `
            <div class="card-rank">${card.rank}</div>
            <div class="card-image">${imageContent}</div>
            <div class="card-title">${card.title}</div>
            <div class="card-subtitle">${card.subtitle}</div>
        `;
        container.appendChild(cardElement);
    });
}

/**
 * Create track list
 */
function createTrackList(tracks, container) {
    const tbody = container.querySelector('tbody') || container;
    tbody.innerHTML = '';

    tracks.forEach((track, index) => {
        const row = document.createElement('tr');
        
        const imageContent = track.album_image 
            ? `<img src="${track.album_image}" alt="${track.song_name}" style="width: 100%; height: 100%; object-fit: cover;">` 
            : '';
        
        const duration = track.duration_ms ? formatDuration(track.duration_ms) : '-:--';
        const popularity = track.popularity || 0;
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <div class="track-image" style="width: 48px; height: 48px;">
                    ${imageContent}
                </div>
            </td>
            <td>
                <div style="font-weight: bold;">${track.song_name}</div>
                <div style="font-size: 10px; color: #666;">${track.artists || 'Unknown Artist'}</div>
            </td>
            <td>${popularity}</td>
            <td>${duration}</td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Create release trends chart
 */
function createReleaseTrendsChart(data, container) {
    container.innerHTML = '';
    
    if (data.error) {
        showError(container, data.error);
        return;
    }
    
    if (!data.data || data.data.length === 0) {
        showError(container, 'No release year data available');
        return;
    }

    // Create chart header with stats
    const header = document.createElement('div');
    header.style.marginBottom = '24px';
            header.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin: 0; font-weight: bold;">Release Year Distribution</h3>
            <div style="display: flex; gap: 24px;">
                <div style="text-align: center;">
                    <div style="color: #000080; font-size: 24px; font-weight: bold;">${data.total_tracks}</div>
                    <div style="font-size: 11px;">Total Tracks</div>
                </div>
                <div style="text-align: center;">
                    <div style="color: #000080; font-size: 24px; font-weight: bold;">${data.peak_year.year}</div>
                    <div style="font-size: 11px;">Peak Year</div>
                </div>
            </div>
        </div>
    `;
    container.appendChild(header);

    // Create bar chart
    const chartContainer = document.createElement('div');
    chartContainer.style.cssText = `
        background: white;
        border: 2px inset #c0c0c0;
        padding: 16px;
        margin-bottom: 16px;
    `;
    
    // Find max count for scaling
    const maxCount = Math.max(...data.data.map(d => d.count));
    
    // Create bars
    const barsContainer = document.createElement('div');
    barsContainer.style.cssText = `
        display: flex;
        align-items: end;
        gap: 4px;
        height: 200px;
        margin-bottom: 16px;
        padding: 0 8px;
    `;
    
    data.data.forEach(item => {
        if (item.count > 0) {
            const barContainer = document.createElement('div');
            barContainer.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                cursor: pointer;
                transition: all 0.2s ease;
            `;
            
            const barHeight = (item.count / maxCount) * 160; // Max height 160px
            const bar = document.createElement('div');
            bar.style.cssText = `
                width: 100%;
                height: ${barHeight}px;
                background: #000080;
                margin-bottom: 8px;
                transition: all 0.2s ease;
                position: relative;
            `;
            
            // Add count label on hover
            const countLabel = document.createElement('div');
            countLabel.textContent = item.count;
            countLabel.style.cssText = `
                position: absolute;
                top: -24px;
                left: 50%;
                transform: translateX(-50%);
                background: #c0c0c0;
                color: #000;
                font-size: 11px;
                padding: 4px 8px;
                border: 2px inset #c0c0c0;
                opacity: 0;
                transition: opacity 0.2s ease;
            `;
            bar.appendChild(countLabel);
            
            const yearLabel = document.createElement('div');
            yearLabel.textContent = item.year;
            yearLabel.style.cssText = `
                font-size: 11px;
                writing-mode: vertical-rl;
                text-orientation: mixed;
            `;
            
            // Hover effects
            barContainer.addEventListener('mouseenter', () => {
                bar.style.transform = 'translateY(-4px)';
                countLabel.style.opacity = '1';
            });
            
            barContainer.addEventListener('mouseleave', () => {
                bar.style.transform = 'translateY(0)';
                countLabel.style.opacity = '0';
            });
            
            barContainer.appendChild(bar);
            barContainer.appendChild(yearLabel);
            barsContainer.appendChild(barContainer);
        }
    });
    
    chartContainer.appendChild(barsContainer);
    container.appendChild(chartContainer);
}

/**
 * Create hidden gems list
 */
function createHiddenGemsList(tracks, container) {
    const tbody = container.querySelector('tbody') || container;
    tbody.innerHTML = '';

    tracks.forEach((track, index) => {
        const row = document.createElement('tr');
        
        const imageContent = track.album_image 
            ? `<img src="${track.album_image}" alt="${track.song_name}" style="width: 100%; height: 100%; object-fit: cover;">` 
            : '';
        
        const duration = track.duration_ms ? formatDuration(track.duration_ms) : '-:--';
        const popularity = track.popularity || 0;
        
        // Create rarity indicator with color coding
        let rarityLabel = '';
        let rarityColor = '';
        
        if (popularity <= 20) {
            rarityLabel = 'Ultra Rare';
            rarityColor = '#8b5cf6'; // Purple for ultra rare
        } else if (popularity <= 40) {
            rarityLabel = 'Very Rare';
            rarityColor = '#3b82f6'; // Blue for very rare
        } else if (popularity <= 60) {
            rarityLabel = 'Rare';
            rarityColor = '#06b6d4'; // Cyan for rare
        } else {
            rarityLabel = 'Uncommon';
            rarityColor = '#10b981'; // Green for uncommon
        }
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <div class="track-image" style="width: 48px; height: 48px;">
                    ${imageContent}
                </div>
            </td>
            <td>
                <div style="font-weight: bold;">${track.song_name}</div>
                <div style="font-size: 10px; color: #666;">${track.artists || 'Unknown Artist'}</div>
            </td>
            <td style="color: ${rarityColor}; font-weight: bold;">
                ${rarityLabel} (${popularity})
            </td>
            <td>${duration}</td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Create seasonal variety chart
 */
function createSeasonalVarietyChart(data, container) {
    container.innerHTML = '';
    
    if (data.error) {
        showError(container, data.error);
        return;
    }
    
    if (!data.seasonal_data || Object.keys(data.seasonal_data).length === 0) {
        showError(container, 'No seasonal data available');
        return;
    }

    // Create header
    const header = document.createElement('div');
    header.style.marginBottom = '16px';
    header.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-weight: bold;">Music Variety by Season</h3>
            <div style="text-align: center;">
                <div style="color: #000080; font-size: 24px; font-weight: bold;">${data.seasons_with_data.length}</div>
                <div style="font-size: 11px;">Seasons with Data</div>
            </div>
        </div>
    `;
    container.appendChild(header);

    // Create seasonal grid
    const seasonsGrid = document.createElement('div');
    seasonsGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 16px;
    `;
    
    const seasonOrder = ['Winter', 'Spring', 'Summer', 'Fall'];
    const seasonEmojis = { 'Winter': '❄️', 'Spring': '🌸', 'Summer': '☀️', 'Fall': '🍂' };
    const seasonColors = { 
        'Winter': '#3B82F6', 
        'Spring': '#10B981', 
        'Summer': '#F59E0B', 
        'Fall': '#EF4444' 
    };
    
    seasonOrder.forEach(season => {
        const seasonData = data.seasonal_data[season] || [];
        
        const seasonCard = document.createElement('div');
        seasonCard.style.cssText = `
            background: white;
            border: 2px inset #c0c0c0;
            padding: 16px;
        `;
        
        // Season header
        const seasonHeader = document.createElement('div');
        seasonHeader.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
        `;
        seasonHeader.innerHTML = `
            <span style="font-size: 24px;">${seasonEmojis[season]}</span>
            <h4 style="margin: 0; font-size: 13px; font-weight: bold;">${season}</h4>
        `;
        seasonCard.appendChild(seasonHeader);
        
        if (seasonData.length === 0) {
            const noData = document.createElement('div');
            noData.style.cssText = `
                text-align: center;
                font-style: italic;
                padding: 20px;
                color: #666;
            `;
            noData.textContent = 'No data for this season';
            seasonCard.appendChild(noData);
        } else {
            // Create genre list
            const genreList = document.createElement('div');
            genreList.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 8px;
            `;
            
            const maxCount = Math.max(...seasonData.map(g => g.count));
            
            seasonData.slice(0, 8).forEach((genre, index) => {
                const genreItem = document.createElement('div');
                genreItem.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 12px;
                `;
                
                const genreBar = document.createElement('div');
                const barWidth = (genre.count / maxCount) * 100;
                genreBar.style.cssText = `
                    flex: 1;
                    height: 24px;
                    background: #c0c0c0;
                    border: 2px inset #c0c0c0;
                    overflow: hidden;
                    position: relative;
                `;
                
                const genreBarFill = document.createElement('div');
                genreBarFill.style.cssText = `
                    height: 100%;
                    width: ${barWidth}%;
                    background: ${seasonColors[season]};
                    transition: width 0.8s ease;
                `;
                
                const genreInfo = document.createElement('div');
                genreInfo.style.cssText = `
                    position: absolute;
                    left: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #000;
                    font-size: 11px;
                    font-weight: bold;
                `;
                genreInfo.textContent = `${genre.genre} (${genre.count})`;
                
                genreBar.appendChild(genreBarFill);
                genreBar.appendChild(genreInfo);
                genreItem.appendChild(genreBar);
                genreList.appendChild(genreItem);
            });
            
            seasonCard.appendChild(genreList);
        }
        
        
        seasonsGrid.appendChild(seasonCard);
    });
    
    container.appendChild(seasonsGrid);
}

/**
 * Show loading state
 */
function showLoading(container) {
    if (container.tagName === 'TBODY') {
        container.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';
    } else {
        container.innerHTML = '<div class="loading">Loading...</div>';
    }
}

/**
 * Show error state
 */
function showError(container, message) {
    if (typeof container === 'string') {
        container = document.getElementById(container);
    }
    if (container.tagName === 'TBODY') {
        container.innerHTML = `<tr><td colspan="5" class="error">${message}</td></tr>`;
    } else {
        container.innerHTML = `<div class="error">${message}</div>`;
    }
}

/**
 * Format duration from milliseconds to MM:SS
 */
function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get time range label
 */
function getTimeRangeLabel(range) {
    switch (range) {
        case 'short_term': return '4 Weeks';
        case 'medium_term': return '6 Months';
        case 'long_term': return '1 Year';
        default: return '6 Months';
    }
}

/**
 * Check if all Music Analytics preview cards are loaded and show the fieldset if so
 */
function checkAndShowMusicAnalyticsFieldset(targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const fieldset = targetWindow.querySelector('#music-analytics-fieldset') || targetWindow.querySelector('[id*="music-analytics-fieldset"]');
    if (!fieldset) return;
    
    // Check if all four preview cards are visible (no longer have loading-hidden class)
    const timelessCard = targetWindow.querySelector('.preview-card[data-section="timeless-artists"]');
    const trendingDownCard = targetWindow.querySelector('.preview-card[data-section="trending-down"]');
    const releaseTrendsCard = targetWindow.querySelector('.preview-card[data-section="release-trends"]');
    const seasonalCard = targetWindow.querySelector('.preview-card[data-section="seasonal-variety"]');
    
    const allLoaded = timelessCard && !timelessCard.classList.contains('loading-hidden') &&
                      trendingDownCard && !trendingDownCard.classList.contains('loading-hidden') &&
                      releaseTrendsCard && !releaseTrendsCard.classList.contains('loading-hidden') &&
                      seasonalCard && !seasonalCard.classList.contains('loading-hidden');
    
    if (allLoaded) {
        fieldset.classList.remove('loading-hidden');
    }
}

/**
 * Load all preview data for dashboard sections
 */
async function loadAllPreviews(tracksData, artistsData, albumsData, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    
    // Load previews for sections with existing data
    if (tracksData) {
        createPreviewTracks(tracksData.slice(0, 3), targetWindow);
        createPreviewHiddenGems(tracksData.slice(0, 3).sort((a, b) => a.popularity - b.popularity), targetWindow);
    }
    
    if (artistsData) {
        createPreviewArtists(artistsData.slice(0, 3), targetWindow);
    }
    
    if (albumsData) {
        createPreviewAlbums(albumsData.slice(0, 3), targetWindow);
    }

    // Load additional data for other previews
    try {
        const [playlistsData, timelessData, trendingDownData, releaseTrendsData, seasonalData] = await Promise.all([
            fetch('/top_playlists').then(r => r.json()).catch(() => []),
            fetch('/artists_standing_test_of_time').then(r => r.json()).catch(() => []),
            fetch('/artists_falling_off').then(r => r.json()).catch(() => []),
            fetch(`/release_year_trends?time_range=${selectedTimeRange}`).then(r => r.json()).catch(() => {}),
            fetch(`/music_variety_by_season?time_range=${selectedTimeRange}`).then(r => r.json()).catch(() => {})
        ]);

        // Only create previews if data is valid (not error objects and has content)
        if (Array.isArray(playlistsData) && !playlistsData.error) {
            createPreviewPlaylists(playlistsData.slice(0, 3), targetWindow);
        }
        if (Array.isArray(timelessData) && !timelessData.error) {
            createPreviewTimeless(timelessData.slice(0, 3), targetWindow);
        }
        if (Array.isArray(trendingDownData) && !trendingDownData.error) {
            createPreviewTrendingDown(trendingDownData.slice(0, 3), targetWindow);
        }
        if (releaseTrendsData && !releaseTrendsData.error) {
            createPreviewReleaseTrends(releaseTrendsData, targetWindow);
        }
        if (seasonalData && !seasonalData.error) {
            createPreviewSeasonal(seasonalData, targetWindow);
        }
        
    } catch (error) {
        console.error('Error loading additional preview data:', error);
    }
}

/**
 * Create preview for top tracks
 */
function createPreviewTracks(tracks, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#preview-tracks') || targetWindow.querySelector('[id*="preview-tracks"]');
    if (!container || !tracks || tracks.length === 0) return;
    
    container.innerHTML = '';
    
    tracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        
        const imageContent = track.album_image 
            ? `<img src="${track.album_image}" alt="${track.song_name}">` 
            : '';
            
        item.innerHTML = `
            <div class="preview-item-image">${imageContent}</div>
            <div class="preview-item-info">
                <div class="preview-item-name">${track.song_name}</div>
                <div class="preview-item-artist">${track.artists || 'Unknown Artist'}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

/**
 * Create preview for top artists
 */
function createPreviewArtists(artists, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#preview-artists') || targetWindow.querySelector('[id*="preview-artists"]');
    if (!container || !artists || artists.length === 0) return;
    
    container.innerHTML = '';
    
    artists.forEach((artist, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        
        const imageContent = artist.artist_image 
            ? `<img src="${artist.artist_image}" alt="${artist.artist_name}">` 
            : '';
            
        item.innerHTML = `
            <div class="preview-item-image">${imageContent}</div>
            <div class="preview-item-info">
                <div class="preview-item-name">${artist.artist_name}</div>
                <div class="preview-item-artist">${artist.genres && artist.genres.length > 0 ? artist.genres.slice(0, 2).join(', ') : 'Artist'}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

/**
 * Create preview for top albums
 */
function createPreviewAlbums(albums, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#preview-albums') || targetWindow.querySelector('[id*="preview-albums"]');
    if (!container || !albums || albums.length === 0) return;
    
    container.innerHTML = '';
    
    albums.forEach((album, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        
        const imageContent = album.album_image 
            ? `<img src="${album.album_image}" alt="${album.album_name}">` 
            : '';
            
        item.innerHTML = `
            <div class="preview-item-image">${imageContent}</div>
            <div class="preview-item-info">
                <div class="preview-item-name">${album.album_name}</div>
                <div class="preview-item-artist">${album.artists || 'Unknown Artist'}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

/**
 * Create preview for hidden gems
 */
function createPreviewHiddenGems(tracks, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#preview-hidden-gems') || targetWindow.querySelector('[id*="preview-hidden-gems"]');
    if (!container || !tracks || tracks.length === 0) return;
    
    container.innerHTML = '';
    
    tracks.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        
        const imageContent = track.album_image 
            ? `<img src="${track.album_image}" alt="${track.song_name}">` 
            : '';
        
        // Get rarity color
        const popularity = track.popularity || 0;
        let rarityColor = '#10b981'; // Green default
        if (popularity <= 20) rarityColor = '#8b5cf6'; // Purple
        else if (popularity <= 40) rarityColor = '#3b82f6'; // Blue
        else if (popularity <= 60) rarityColor = '#06b6d4'; // Cyan
            
        item.innerHTML = `
            <div class="preview-item-image">${imageContent}</div>
            <div class="preview-item-info">
                <div class="preview-item-name">${track.song_name}</div>
                <div class="preview-item-artist" style="color: ${rarityColor};">Rarity: ${popularity}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

/**
 * Create preview for playlists
 */
function createPreviewPlaylists(playlists, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#preview-playlists') || targetWindow.querySelector('[id*="preview-playlists"]');
    if (!container || !playlists || playlists.length === 0) return;
    
    container.innerHTML = '';
    
    playlists.forEach((playlist, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        
        const imageContent = playlist.playlist_image 
            ? `<img src="${playlist.playlist_image}" alt="${playlist.playlist_name}">` 
            : '';
            
        item.innerHTML = `
            <div class="preview-item-image">${imageContent}</div>
            <div class="preview-item-info">
                <div class="preview-item-name">${playlist.playlist_name}</div>
                <div class="preview-item-artist">${playlist.top_songs_count || 0} top songs</div>
            </div>
        `;
        container.appendChild(item);
    });
    
    // Show the preview card now that data is ready
    const previewCard = container.closest('.preview-card');
    if (previewCard) {
        previewCard.classList.remove('loading-hidden');
        // Check if we should show the Music Analytics fieldset
        checkAndShowMusicAnalyticsFieldset(targetWindow);
    }
}

/**
 * Create preview for timeless artists
 */
function createPreviewTimeless(artists, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#preview-timeless') || targetWindow.querySelector('[id*="preview-timeless"]');
    if (!container || !artists || artists.length === 0) return;
    
    container.innerHTML = '';
    
    artists.forEach((artist, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        
        const imageContent = artist.artist_image 
            ? `<img src="${artist.artist_image}" alt="${artist.artist_name}">` 
            : '';
            
        item.innerHTML = `
            <div class="preview-item-image">${imageContent}</div>
            <div class="preview-item-info">
                <div class="preview-item-name">${artist.artist_name}</div>
                <div class="preview-item-artist">Consistent favorite</div>
            </div>
        `;
        container.appendChild(item);
    });
    
    // Show the preview card now that data is ready
    const previewCard = container.closest('.preview-card');
    if (previewCard) {
        previewCard.classList.remove('loading-hidden');
        // Check if we should show the Music Analytics fieldset
        checkAndShowMusicAnalyticsFieldset(targetWindow);
    }
}

/**
 * Create preview for trending down artists
 */
function createPreviewTrendingDown(artists, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#preview-trending-down') || targetWindow.querySelector('[id*="preview-trending-down"]');
    if (!container || !artists || artists.length === 0) return;
    
    container.innerHTML = '';
    
    artists.forEach((artist, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        
        const imageContent = artist.artist_image 
            ? `<img src="${artist.artist_image}" alt="${artist.artist_name}">` 
            : '';
            
        item.innerHTML = `
            <div class="preview-item-image">${imageContent}</div>
            <div class="preview-item-info">
                <div class="preview-item-name">${artist.artist_name}</div>
                <div class="preview-item-artist">Declining interest</div>
            </div>
        `;
        container.appendChild(item);
    });
    
    // Show the preview card now that data is ready
    const previewCard = container.closest('.preview-card');
    if (previewCard) {
        previewCard.classList.remove('loading-hidden');
        // Check if we should show the Music Analytics fieldset
        checkAndShowMusicAnalyticsFieldset(targetWindow);
    }
}

/**
 * Create preview for release trends
 */
function createPreviewReleaseTrends(data, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#preview-release-trends') || targetWindow.querySelector('[id*="preview-release-trends"]');
    if (!container || !data || !data.data || data.data.length === 0) return;
    
    container.innerHTML = '';
    
    // Create mini chart
    const chartContainer = document.createElement('div');
    chartContainer.className = 'preview-mini-chart';
    
    // Get max value for scaling
    const maxCount = Math.max(...data.data.map(item => item.count));
    
    // Show last 8 years of data
    const recentData = data.data.slice(-8);
    
    recentData.forEach(item => {
        const bar = document.createElement('div');
        bar.className = 'preview-chart-bar';
        bar.style.height = `${(item.count / maxCount) * 100}%`;
        bar.title = `${item.year}: ${item.count} tracks`;
        chartContainer.appendChild(bar);
    });
    
    container.appendChild(chartContainer);
    
    // Add summary text
    const summary = document.createElement('div');
    summary.style.color = 'var(--spotify-light-text)';
    summary.style.fontSize = '12px';
    summary.style.marginTop = '8px';
    const peakYear = data.peak_year && data.peak_year.year ? data.peak_year.year : 'N/A';
    summary.textContent = `Peak year: ${peakYear}`;
    container.appendChild(summary);
    
    // Show the preview card now that data is ready
    const previewCard = container.closest('.preview-card');
    if (previewCard) {
        previewCard.classList.remove('loading-hidden');
        // Check if we should show the Music Analytics fieldset
        checkAndShowMusicAnalyticsFieldset(targetWindow);
    }
}

/**
 * Create preview for seasonal variety
 */
function createPreviewSeasonal(data, targetWindow = null) {
    if (!targetWindow) targetWindow = document;
    const container = targetWindow.querySelector('#preview-seasonal') || targetWindow.querySelector('[id*="preview-seasonal"]');
    if (!container || !data || !data.seasonal_data) return;
    
    container.innerHTML = '';
    
    const seasons = ['Spring', 'Summer', 'Fall', 'Winter'];
    const seasonColors = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6'];
    
    seasons.forEach((season, index) => {
        const seasonData = data.seasonal_data[season.toLowerCase()];
        if (!seasonData || !seasonData.genres) return;
        
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '8px';
        item.style.padding = '4px 0';
        
        const dot = document.createElement('div');
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '50%';
        dot.style.background = seasonColors[index];
        dot.style.flexShrink = '0';
        
        const text = document.createElement('div');
        text.style.color = 'var(--spotify-white)';
        text.style.fontSize = '12px';
        text.textContent = `${season}: ${Object.keys(seasonData.genres).length} genres`;
        
        item.appendChild(dot);
        item.appendChild(text);
        container.appendChild(item);
    });
    
    // Show the preview card now that data is ready
    const previewCard = container.closest('.preview-card');
    if (previewCard) {
        previewCard.classList.remove('loading-hidden');
        // Check if we should show the Music Analytics fieldset
        checkAndShowMusicAnalyticsFieldset(targetWindow);
    }
}