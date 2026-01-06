# Euterpe - Spotify App Description

## App Functionality

Euterpe is a personal music analytics dashboard that provides Spotify users with deep insights into their listening habits and musical journey. Named after Euterpe, the Greek muse of music, the application transforms user listening data into an elegant, interactive analytics experience.

### Core Features

**Music Library Analytics:**
- **Top Tracks**: Displays users' most-played songs with popularity ratings, album artwork, and artist information across three time periods (4 weeks, 6 months, 1 year)
- **Top Artists**: Shows favorite artists with genre information and profile photos, allowing users to see how their musical preferences evolve over time
- **Top Albums**: Identifies most-listened albums with cover art and artist details
- **Hidden Gems**: Discovers users' rarest tracks (lowest popularity scores) to highlight unique musical tastes
- **Top Playlists**: Analyzes which playlists contain the most of a user's top songs

**Advanced Analytics:**
- **Timeless Artists**: Identifies artists that consistently appear across different time periods, showing long-term musical loyalty
- **Trending Down**: Highlights artists with declining interest over time, revealing changing musical preferences
- **Release Trends**: Visual analysis of music consumption by release year, showing whether users prefer new releases or classic tracks
- **Seasonal Variety**: Analyzes genre diversity across different seasons, revealing patterns in musical exploration

**User Experience:**
- Beautiful, Spotify-inspired dark theme interface with responsive design
- Interactive charts and visualizations using native HTML/CSS/JavaScript
- Real-time data fetching directly from Spotify's Web API
- No data storage - all analytics computed on-demand from live Spotify data

### How Users Benefit

Euterpe helps users:
- Understand their musical evolution and how their taste changes over time
- Discover hidden preferences and rare tracks that define their unique taste
- Identify artist loyalty patterns and long-term favorites
- Explore seasonal listening patterns and genre diversity
- Gain insights into their music discovery habits

## Technical Implementation

### Architecture

Euterpe is a production-ready, multi-user web application built with the following technology stack:

**Backend:**
- **Flask 3.0+**: Python web framework handling HTTP requests and routing
- **PostgreSQL**: Database for secure, encrypted storage of user authentication tokens
- **Spotipy 2.23.0**: Official Python library for Spotify Web API integration
- **SQLAlchemy**: ORM for database operations with schema isolation
- **Cryptography (Fernet)**: AES-128 encryption for secure token storage at rest

**Frontend:**
- Native HTML5, CSS3, and JavaScript (ES6+)
- Responsive design with mobile support
- Client-side data visualization and chart rendering
- No heavy JavaScript frameworks - lightweight and fast

**Deployment:**
- Hosted on Heroku cloud platform
- Gunicorn WSGI server for production
- PostgreSQL database with connection pooling
- HTTPS enforced for all connections

### Spotify API Integration

**OAuth 2.0 Flow:**
- Implements standard Spotify OAuth 2.0 authorization code flow
- Secure token storage with encryption at rest using Fernet (AES-128)
- Automatic token refresh before expiration (2-minute buffer)
- Per-user session management with isolated token storage

**API Endpoints Used:**
- `GET /v1/me/top/tracks` - Retrieve user's top tracks (short_term, medium_term, long_term)
- `GET /v1/me/top/artists` - Retrieve user's top artists across time ranges
- `GET /v1/me/playlists` - Access user's playlists for analysis
- `GET /v1/me` - User profile information for authentication
- `POST /api/token` - Token refresh endpoint

**Requested Scopes:**
- `user-top-read`: Access to top tracks and artists
- `user-read-recently-played`: Recent listening history
- `user-library-read`: Saved music library
- `playlist-read-private`: Access to private playlists
- `playlist-read-collaborative`: Collaborative playlists
- `user-read-email`: User email (optional, for account management)

### Security & Privacy

**Data Handling:**
- **No Persistent Data Storage**: All music data is fetched in real-time from Spotify's API. No listening history, track data, or personal preferences are stored in our database.
- **Encrypted Token Storage**: OAuth tokens are encrypted using Fernet (AES-128) before database storage. Only encrypted tokens are stored - never plaintext credentials.
- **Session Management**: User sessions use secure, HTTP-only cookies with SameSite protection. Sessions contain only user IDs, never tokens or sensitive data.
- **Schema Isolation**: Database tables are isolated in a dedicated schema to prevent conflicts with other applications sharing the same database infrastructure.

**Privacy Protection:**
- Users can log out at any time, which immediately clears their session
- No data sharing between users - each user only sees their own analytics
- No third-party data sharing or analytics tracking
- All API calls are made on-demand - no background data collection

**Security Measures:**
- HTTPS enforced for all connections (Heroku automatic SSL)
- SQL injection prevention via SQLAlchemy ORM with parameterized queries
- XSS protection through Flask's automatic template escaping
- Secure session cookies (HttpOnly, Secure, SameSite=Lax)
- Environment variables for all sensitive credentials
- Connection pooling with conservative limits to prevent resource exhaustion

### Multi-User Support

The application supports concurrent multi-user access:
- Each user has isolated authentication tokens stored separately
- Per-user session management prevents data leakage between users
- Stateless OAuth managers created per-request (no shared state)
- Database-backed token storage ensures persistence across server restarts

### Performance

- **Efficient API Usage**: Parallel data fetching where possible, with smart caching patterns
- **Lightweight Frontend**: Native JavaScript charts instead of heavy visualization libraries
- **Connection Pooling**: Optimized database connection management (5 persistent, 10 overflow)
- **Fast Response Times**: Average API response time 250-550ms per request

### Compliance

- Follows Spotify Web API Terms of Service
- Implements OAuth 2.0 best practices
- Respects user privacy with minimal data collection
- No modification of user playlists or library
- Read-only access to user data
- Clear user consent through Spotify's authorization flow

## Use Case

Euterpe is designed for Spotify users who want to:
- Gain deeper insights into their listening habits
- Understand how their musical taste evolves over time
- Discover patterns in their music consumption
- Explore their unique musical preferences through data visualization

The application serves as a personal analytics tool, helping users better understand their relationship with music through their Spotify listening data.



