// Global state
let selectedTimeRange = 'medium_term';
let currentSection = 'overview';

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

/**
 * Initialize the application
 */
function initializeApp() {
    setupNavigation();
    setupTimeRangeControls();
    loadOverviewData();
}

/**
 * Setup navigation event listeners
 */
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const section = e.currentTarget.dataset.section;
            if (section) {
                switchSection(section);
            }
        });
    });

    // Add event listeners for preview cards
    const previewCards = document.querySelectorAll('.preview-card');
    previewCards.forEach(card => {
        card.addEventListener('click', (e) => {
            const section = e.currentTarget.dataset.section;
            if (section) {
                switchSection(section);
            }
        });
    });
}

/**
 * Setup time range controls
 */
function setupTimeRangeControls() {
    const timeRangeButtons = document.querySelectorAll('.time-range-btn');
    
    timeRangeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const range = e.currentTarget.dataset.range;
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
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
    
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
        section.classList.add('hidden');
    });
    
    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
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
    
    // Update button states
    document.querySelectorAll('.time-range-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-range="${range}"]`).classList.add('active');
    
    // Reload current section data
    loadSectionData(currentSection);
}

/**
 * Load data for specific section
 */
function loadSectionData(sectionId) {
    switch (sectionId) {
        case 'overview':
            loadOverviewData();
            break;
        case 'top-tracks':
            loadTopTracks();
            break;
        case 'top-artists':
            loadTopArtists();
            break;
        case 'top-albums':
            loadTopAlbums();
            break;
        case 'playlists':
            loadTopPlaylists();
            break;
        case 'hidden-gems':
            loadHiddenGems();
            break;
        case 'timeless-artists':
            loadTimelessArtists();
            break;
        case 'trending-down':
            loadTrendingDown();
            break;
        case 'release-trends':
            loadReleaseTrends();
            break;
        case 'seasonal-variety':
            loadSeasonalVariety();
            break;
    }
}

/**
 * Load overview data (stats + quick preview)
 */
async function loadOverviewData() {
    try {
        // Load multiple endpoints in parallel for overview
        const [tracksData, artistsData, albumsData] = await Promise.all([
            fetch(`/top_songs?time_range=${selectedTimeRange}`).then(r => r.json()),
            fetch(`/top_artists?time_range=${selectedTimeRange}`).then(r => r.json()),
            fetch(`/top_albums?time_range=${selectedTimeRange}`).then(r => r.json())
        ]);

        // Create stats
        createStatsGrid([
            { label: 'Top Tracks', value: tracksData.length || 0 },
            { label: 'Top Artists', value: artistsData.length || 0 },
            { label: 'Top Albums', value: albumsData.length || 0 },
            { label: 'Time Range', value: getTimeRangeLabel(selectedTimeRange) }
        ]);

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

        createOverviewCards(overviewCards);

        // Load preview data for all sections
        loadAllPreviews(tracksData, artistsData, albumsData);

    } catch (error) {
        console.error('Error loading overview data:', error);
        showError('overview-stats', 'Failed to load overview data');
        showError('overview-cards', 'Failed to load overview cards');
    }
}

/**
 * Load top tracks
 */
async function loadTopTracks() {
    const container = document.getElementById('tracks-list');
    showLoading(container);

    try {
        const response = await fetch(`/top_songs?time_range=${selectedTimeRange}`);
        const data = await response.json();

        if (data.error) {
            showError(container, data.error);
            return;
        }

        createTrackList(data, container);
    } catch (error) {
        console.error('Error loading top tracks:', error);
        showError(container, 'Failed to load top tracks');
    }
}

/**
 * Load top artists
 */
async function loadTopArtists() {
    const container = document.getElementById('artists-grid');
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
async function loadTopAlbums() {
    const container = document.getElementById('albums-grid');
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
async function loadTopPlaylists() {
    const container = document.getElementById('playlists-grid');
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
async function loadHiddenGems() {
    const container = document.getElementById('hidden-gems-list');
    showLoading(container);

    try {
        const response = await fetch(`/hidden_gems?time_range=${selectedTimeRange}`);
        const data = await response.json();

        if (data.error) {
            showError(container, data.error);
            return;
        }

        createHiddenGemsList(data, container);
    } catch (error) {
        console.error('Error loading hidden gems:', error);
        showError(container, 'Failed to load hidden gems');
    }
}

/**
 * Load timeless artists
 */
async function loadTimelessArtists() {
    const container = document.getElementById('timeless-artists-grid');
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
async function loadTrendingDown() {
    const container = document.getElementById('trending-down-grid');
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
async function loadReleaseTrends() {
    const container = document.getElementById('release-trends-chart');
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
async function loadSeasonalVariety() {
    const container = document.getElementById('seasonal-variety-chart');
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
function createStatsGrid(stats) {
    const container = document.getElementById('overview-stats');
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
function createOverviewCards(cards) {
    const container = document.getElementById('overview-cards');
    container.innerHTML = '';

    cards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = 'music-card';
        
        const imageContent = card.image 
            ? `<img src="${card.image}" alt="${card.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` 
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
            ? `<img src="${card.image}" alt="${card.title}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` 
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
    container.innerHTML = '';

    // Add header
    const header = document.createElement('div');
    header.className = 'track-list-header';
    header.innerHTML = `
        <span style="width: 32px; text-align: center;">#</span>
        <span style="margin-left: 64px;">Title</span>
        <span style="margin-left: auto; margin-right: 24px;">Popularity</span>
        <span style="width: 60px; text-align: right;">Duration</span>
    `;
    container.appendChild(header);

    tracks.forEach((track, index) => {
        const trackElement = document.createElement('div');
        trackElement.className = 'track-item';
        
        const imageContent = track.album_image 
            ? `<img src="${track.album_image}" alt="${track.song_name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">` 
            : '';
        
        const duration = track.duration_ms ? formatDuration(track.duration_ms) : '-:--';
        const popularity = track.popularity || 0;
        
        trackElement.innerHTML = `
            <span class="track-number">${index + 1}</span>
            <div class="track-image">${imageContent}</div>
            <div class="track-info">
                <div class="track-name">${track.song_name}</div>
                <div class="track-artist">${track.artists || 'Unknown Artist'}</div>
            </div>
            <span class="track-plays">${popularity}</span>
            <span class="track-duration">${duration}</span>
        `;
        container.appendChild(trackElement);
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
            <h3 style="color: var(--spotify-white); margin: 0;">Release Year Distribution</h3>
            <div style="display: flex; gap: 24px;">
                <div style="text-align: center;">
                    <div style="color: var(--spotify-green); font-size: 24px; font-weight: bold;">${data.total_tracks}</div>
                    <div style="color: var(--spotify-light-text); font-size: 12px;">Total Tracks</div>
                </div>
                <div style="text-align: center;">
                    <div style="color: var(--spotify-green); font-size: 24px; font-weight: bold;">${data.peak_year.year}</div>
                    <div style="color: var(--spotify-light-text); font-size: 12px;">Peak Year</div>
                </div>
            </div>
        </div>
    `;
    container.appendChild(header);

    // Create bar chart
    const chartContainer = document.createElement('div');
    chartContainer.style.cssText = `
        background: var(--spotify-medium-gray);
        border-radius: 8px;
        padding: 24px;
        margin-bottom: 24px;
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
                background: linear-gradient(180deg, var(--spotify-green-hover), var(--spotify-green));
                border-radius: 4px 4px 0 0;
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
                background: var(--spotify-black);
                color: var(--spotify-white);
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 4px;
                opacity: 0;
                transition: opacity 0.2s ease;
            `;
            bar.appendChild(countLabel);
            
            const yearLabel = document.createElement('div');
            yearLabel.textContent = item.year;
            yearLabel.style.cssText = `
                color: var(--spotify-light-text);
                font-size: 12px;
                font-weight: 500;
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
    container.innerHTML = '';

    // Add header
    const header = document.createElement('div');
    header.className = 'track-list-header';
    header.innerHTML = `
        <span style="width: 32px; text-align: center;">#</span>
        <span style="margin-left: 64px;">Title</span>
        <span style="margin-left: auto; margin-right: 24px;">Rarity</span>
        <span style="width: 60px; text-align: right;">Duration</span>
    `;
    container.appendChild(header);

    tracks.forEach((track, index) => {
        const trackElement = document.createElement('div');
        trackElement.className = 'track-item';
        
        const imageContent = track.album_image 
            ? `<img src="${track.album_image}" alt="${track.song_name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;">` 
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
        
        trackElement.innerHTML = `
            <span class="track-number">${index + 1}</span>
            <div class="track-image">${imageContent}</div>
            <div class="track-info">
                <div class="track-name">${track.song_name}</div>
                <div class="track-artist">${track.artists || 'Unknown Artist'}</div>
            </div>
            <span class="track-plays" style="color: ${rarityColor}; font-weight: 600;">
                ${rarityLabel} (${popularity})
            </span>
            <span class="track-duration">${duration}</span>
        `;
        container.appendChild(trackElement);
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
    header.style.marginBottom = '24px';
    header.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="color: var(--spotify-white); margin: 0;">Music Variety by Season</h3>
            <div style="text-align: center;">
                <div style="color: var(--spotify-green); font-size: 24px; font-weight: bold;">${data.seasons_with_data.length}</div>
                <div style="color: var(--spotify-light-text); font-size: 12px;">Seasons with Data</div>
            </div>
        </div>
    `;
    container.appendChild(header);

    // Create seasonal grid
    const seasonsGrid = document.createElement('div');
    seasonsGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 24px;
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
            background: var(--spotify-medium-gray);
            border-radius: 8px;
            padding: 20px;
            transition: all 0.3s ease;
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
            <h4 style="color: var(--spotify-white); margin: 0; font-size: 18px;">${season}</h4>
        `;
        seasonCard.appendChild(seasonHeader);
        
        if (seasonData.length === 0) {
            const noData = document.createElement('div');
            noData.style.cssText = `
                text-align: center;
                color: var(--spotify-light-text);
                font-style: italic;
                padding: 20px;
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
                    background: var(--spotify-light-gray);
                    border-radius: 12px;
                    overflow: hidden;
                    position: relative;
                `;
                
                const genreBarFill = document.createElement('div');
                genreBarFill.style.cssText = `
                    height: 100%;
                    width: ${barWidth}%;
                    background: ${seasonColors[season]};
                    border-radius: 12px;
                    transition: width 0.8s ease;
                    animation: fillBar 0.8s ease forwards;
                `;
                
                const genreInfo = document.createElement('div');
                genreInfo.style.cssText = `
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: var(--spotify-white);
                    font-size: 12px;
                    font-weight: 500;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
                `;
                genreInfo.textContent = `${genre.genre} (${genre.count})`;
                
                genreBar.appendChild(genreBarFill);
                genreBar.appendChild(genreInfo);
                genreItem.appendChild(genreBar);
                genreList.appendChild(genreItem);
            });
            
            seasonCard.appendChild(genreList);
        }
        
        // Hover effect
        seasonCard.addEventListener('mouseenter', () => {
            seasonCard.style.backgroundColor = 'var(--spotify-light-gray)';
            seasonCard.style.transform = 'translateY(-2px)';
        });
        
        seasonCard.addEventListener('mouseleave', () => {
            seasonCard.style.backgroundColor = 'var(--spotify-medium-gray)';
            seasonCard.style.transform = 'translateY(0)';
        });
        
        seasonsGrid.appendChild(seasonCard);
    });
    
    container.appendChild(seasonsGrid);
}

/**
 * Show loading state
 */
function showLoading(container) {
    container.innerHTML = '<div class="loading">Loading...</div>';
}

/**
 * Show error state
 */
function showError(container, message) {
    if (typeof container === 'string') {
        container = document.getElementById(container);
    }
    container.innerHTML = `<div class="error">${message}</div>`;
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
 * Load all preview data for dashboard sections
 */
async function loadAllPreviews(tracksData, artistsData, albumsData) {
    // Load previews for sections with existing data
    if (tracksData) {
        createPreviewTracks(tracksData.slice(0, 3));
        createPreviewHiddenGems(tracksData.slice(0, 3).sort((a, b) => a.popularity - b.popularity));
    }
    
    if (artistsData) {
        createPreviewArtists(artistsData.slice(0, 3));
    }
    
    if (albumsData) {
        createPreviewAlbums(albumsData.slice(0, 3));
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

        createPreviewPlaylists(playlistsData.slice(0, 3));
        createPreviewTimeless(timelessData.slice(0, 3));
        createPreviewTrendingDown(trendingDownData.slice(0, 3));
        createPreviewReleaseTrends(releaseTrendsData);
        createPreviewSeasonal(seasonalData);
        
    } catch (error) {
        console.error('Error loading additional preview data:', error);
    }
}

/**
 * Create preview for top tracks
 */
function createPreviewTracks(tracks) {
    const container = document.getElementById('preview-tracks');
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
function createPreviewArtists(artists) {
    const container = document.getElementById('preview-artists');
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
function createPreviewAlbums(albums) {
    const container = document.getElementById('preview-albums');
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
function createPreviewHiddenGems(tracks) {
    const container = document.getElementById('preview-hidden-gems');
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
function createPreviewPlaylists(playlists) {
    const container = document.getElementById('preview-playlists');
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
}

/**
 * Create preview for timeless artists
 */
function createPreviewTimeless(artists) {
    const container = document.getElementById('preview-timeless');
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
}

/**
 * Create preview for trending down artists
 */
function createPreviewTrendingDown(artists) {
    const container = document.getElementById('preview-trending-down');
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
}

/**
 * Create preview for release trends
 */
function createPreviewReleaseTrends(data) {
    const container = document.getElementById('preview-release-trends');
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
}

/**
 * Create preview for seasonal variety
 */
function createPreviewSeasonal(data) {
    const container = document.getElementById('preview-seasonal');
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
}