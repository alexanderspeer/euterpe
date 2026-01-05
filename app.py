"""
Euterpe - Multi-User Spotify Analytics Dashboard
Production-ready Flask application with PostgreSQL-backed OAuth
"""

from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, session
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Import database and encryption
from models import db, User, UserToken, EUTERPE_SCHEMA
from encryption import encrypt_token, decrypt_token

# Import analytics logic
from logic import (
    get_top_albums,
    get_top_songs,
    get_top_artists,
    get_hidden_gems,
    analyze_top_playlists,
    get_artists_standing_test_of_time,
    get_artists_fallen_off,
    get_release_year_trends,
    get_music_variety_by_season
)

# Load environment variables (for local development)
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# ============================================================================
# CONFIGURATION
# ============================================================================

# Security: Secret key for session signing
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')
if not app.config['SECRET_KEY']:
    raise ValueError("SECRET_KEY environment variable must be set")

# Session configuration
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
# Only use secure cookies in production (Heroku)
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('DYNO') is not None

# Database configuration
DATABASE_URL = os.environ.get('DATABASE_URL')
if DATABASE_URL:
    # Heroku provides postgres:// but SQLAlchemy needs postgresql://
    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
else:
    # Local development fallback
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///euterpe_local.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Conservative connection pooling for Heroku Postgres Essential-0 (20 connections max)
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,      # Verify connections before using
    'pool_recycle': 300,         # Recycle connections after 5 minutes
    'pool_size': 5,              # Keep 5 connections in pool
    'max_overflow': 10,          # Allow 10 additional connections if needed
}

# Initialize database
db.init_app(app)

# Spotify API credentials
SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', os.environ.get('CLIENT_ID', '')).strip()
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', os.environ.get('CLIENT_SECRET', '')).strip()
SPOTIFY_REDIRECT_URI = os.environ.get('SPOTIFY_REDIRECT_URI', os.environ.get('REDIRECT_URI', '')).strip()
SPOTIFY_SCOPE = os.environ.get('SPOTIFY_SCOPE', os.environ.get('SCOPE', '')).strip()

if not all([SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPE]):
    raise ValueError("All Spotify credentials must be set in environment variables")

# ============================================================================
# SPOTIFY OAUTH HELPERS (PER-USER)
# ============================================================================

def get_spotify_oauth():
    """
    Create a Spotify OAuth manager (stateless, no cache).
    For multi-user support, we never use file-based caching.
    """
    return SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope=SPOTIFY_SCOPE,
        cache_path=None,  # CRITICAL: No file caching
        open_browser=False,
        show_dialog=True  # Force login screen for clarity
    )


def get_current_user():
    """
    Get the current logged-in user from session.
    
    Returns:
        User: The user object, or None if not logged in
    """
    user_id = session.get('user_id')
    if not user_id:
        return None
    
    return User.query.filter_by(id=user_id).first()


def refresh_user_token_if_needed(user):
    """
    Refresh user's Spotify token if it's expired or about to expire.
    
    Args:
        user (User): The user whose token to refresh
        
    Returns:
        bool: True if token is valid (refreshed if needed), False if refresh failed
    """
    if not user or not user.token:
        return False
    
    # Check if token expires within the next 2 minutes
    now = datetime.now(timezone.utc)
    expires_at = user.token.expires_at
    
    # Make expires_at timezone-aware if it isn't
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at > now + timedelta(minutes=2):
        # Token is still valid
        return True
    
    # Token expired or about to expire - refresh it
    print(f"Refreshing token for user {user.spotify_user_id}")
    
    try:
        oauth = get_spotify_oauth()
        refresh_token = decrypt_token(user.token.refresh_token_encrypted)
        
        # Manually call Spotify token refresh endpoint
        token_info = oauth.refresh_access_token(refresh_token)
        
        # Update token in database
        user.token.access_token_encrypted = encrypt_token(token_info['access_token'])
        user.token.expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_info['expires_in'])
        user.token.updated_at = datetime.now(timezone.utc)
        
        # Update refresh token if provided (Spotify sometimes rotates it)
        if 'refresh_token' in token_info:
            user.token.refresh_token_encrypted = encrypt_token(token_info['refresh_token'])
        
        db.session.commit()
        print(f"Token refreshed successfully for user {user.spotify_user_id}")
        return True
        
    except Exception as e:
        print(f"Error refreshing token for user {user.spotify_user_id}: {e}")
        return False


def get_spotify_client_for_current_user():
    """
    Get an authenticated Spotify client for the current session user.
    Automatically refreshes token if needed.
    
    Returns:
        spotipy.Spotify: Authenticated Spotify client, or None if not authenticated
    """
    user = get_current_user()
    if not user or not user.token:
        return None
    
    # Refresh token if needed
    if not refresh_user_token_if_needed(user):
        return None
    
    # Decrypt access token
    access_token = decrypt_token(user.token.access_token_encrypted)
    
    # Create Spotify client with the access token
    return spotipy.Spotify(auth=access_token)


# ============================================================================
# AUTHENTICATION ROUTES
# ============================================================================

@app.route('/login')
def login():
    """
    Initiate Spotify OAuth flow.
    Redirects user to Spotify authorization page.
    """
    oauth = get_spotify_oauth()
    auth_url = oauth.get_authorize_url()
    return redirect(auth_url)


@app.route('/callback')
def callback():
    """
    OAuth callback - handles Spotify authorization response.
    Exchanges code for tokens, stores in database, creates session.
    """
    # Check for errors
    error = request.args.get('error')
    if error:
        return render_template_string("""
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Failed</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>Authorization Failed</h1>
            <p>Error: {{ error }}</p>
            <p><a href="/login" style="padding: 10px 20px; background: #1DB954; color: white; text-decoration: none; border-radius: 5px;">Try Again</a></p>
        </body>
        </html>
        """, error=error)
    
    # Get authorization code
    code = request.args.get('code')
    if not code:
        return redirect(url_for('login'))
    
    try:
        # Exchange code for tokens
        oauth = get_spotify_oauth()
        token_info = oauth.get_access_token(code, as_dict=True)
        
        # Get user profile from Spotify
        temp_sp = spotipy.Spotify(auth=token_info['access_token'])
        spotify_user = temp_sp.current_user()
        
        # Find or create user in database
        user = User.query.filter_by(spotify_user_id=spotify_user['id']).first()
        
        if user:
            # Update existing user
            user.display_name = spotify_user.get('display_name', spotify_user['id'])
            user.email = spotify_user.get('email')
            user.updated_at = datetime.now(timezone.utc)
        else:
            # Create new user
            user = User(
                spotify_user_id=spotify_user['id'],
                display_name=spotify_user.get('display_name', spotify_user['id']),
                email=spotify_user.get('email')
            )
            db.session.add(user)
            db.session.flush()  # Get user.id before creating token
        
        # Calculate token expiration
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_info['expires_in'])
        
        # Store or update tokens (encrypted)
        if user.token:
            # Update existing token
            user.token.access_token_encrypted = encrypt_token(token_info['access_token'])
            user.token.refresh_token_encrypted = encrypt_token(token_info['refresh_token'])
            user.token.expires_at = expires_at
            user.token.scope = token_info.get('scope', SPOTIFY_SCOPE)
            user.token.updated_at = datetime.now(timezone.utc)
        else:
            # Create new token
            user_token = UserToken(
                user_id=user.id,
                access_token_encrypted=encrypt_token(token_info['access_token']),
                refresh_token_encrypted=encrypt_token(token_info['refresh_token']),
                expires_at=expires_at,
                token_type=token_info.get('token_type', 'Bearer'),
                scope=token_info.get('scope', SPOTIFY_SCOPE)
            )
            db.session.add(user_token)
        
        db.session.commit()
        
        # Set session
        session['user_id'] = user.id
        session.permanent = True
        
        print(f"User {user.display_name} ({user.spotify_user_id}) logged in successfully")
        
        return redirect(url_for('index'))
        
    except Exception as e:
        print(f"Error in OAuth callback: {e}")
        return render_template_string("""
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Error</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>Authorization Error</h1>
            <p>{{ error }}</p>
            <p><a href="/login" style="padding: 10px 20px; background: #1DB954; color: white; text-decoration: none; border-radius: 5px;">Try Again</a></p>
        </body>
        </html>
        """, error=str(e))


@app.route('/logout')
def logout():
    """
    Log out the current user by clearing their session.
    """
    user = get_current_user()
    if user:
        print(f"User {user.display_name} logged out")
    
    session.clear()
    return redirect(url_for('login'))


# ============================================================================
# MAIN ROUTES
# ============================================================================

@app.route('/')
def index():
    """
    Main dashboard page.
    Requires authentication - redirects to login if not authenticated.
    """
    user = get_current_user()
    if not user:
        return redirect(url_for('login'))
    
    return render_template('index.html', user=user)


@app.route('/favicon.png')
def favicon():
    """Serve favicon"""
    return send_from_directory(os.path.join(app.root_path, ''), 'favicon.png', mimetype='image/png')

@app.route('/paperclip.webp')
def paperclip():
    """Serve paperclip icon"""
    return send_from_directory(os.path.join(app.root_path, ''), 'paperclip.webp', mimetype='image/webp')


# ============================================================================
# API ROUTES (ALL REQUIRE AUTHENTICATION)
# ============================================================================

@app.route('/top_albums', methods=['GET'])
def top_albums():
    """Get top albums for current user"""
    client = get_spotify_client_for_current_user()
    if not client:
        return jsonify({'error': 'Not authenticated. Please log in.'}), 401
    
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_albums(client, time_range)
    return jsonify(data)


@app.route('/top_songs', methods=['GET'])
def top_songs():
    """Get top songs for current user"""
    client = get_spotify_client_for_current_user()
    if not client:
        return jsonify({'error': 'Not authenticated. Please log in.'}), 401
    
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_songs(client, time_range)
    return jsonify(data)


@app.route('/top_artists', methods=['GET'])
def top_artists():
    """Get top artists for current user"""
    client = get_spotify_client_for_current_user()
    if not client:
        return jsonify({'error': 'Not authenticated. Please log in.'}), 401
    
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_artists(client, time_range)
    return jsonify(data)


@app.route('/top_playlists', methods=['GET'])
def top_playlists():
    """Get top playlists for current user"""
    client = get_spotify_client_for_current_user()
    if not client:
        return jsonify({'error': 'Not authenticated. Please log in.'}), 401
    
    data = analyze_top_playlists(client)
    return jsonify(data)


@app.route('/hidden_gems', methods=['GET'])
def hidden_gems():
    """Get hidden gems for current user"""
    client = get_spotify_client_for_current_user()
    if not client:
        return jsonify({'error': 'Not authenticated. Please log in.'}), 401
    
    time_range = request.args.get('time_range', 'medium_term')
    data = get_hidden_gems(client, time_range)
    return jsonify(data)


@app.route('/artists_standing_test_of_time', methods=['GET'])
def artists_standing_test_of_time():
    """Get timeless artists for current user"""
    client = get_spotify_client_for_current_user()
    if not client:
        return jsonify({'error': 'Not authenticated. Please log in.'}), 401
    
    data = get_artists_standing_test_of_time(client)
    return jsonify(data)


@app.route('/artists_falling_off', methods=['GET'])
def artists_falling_off():
    """Get trending down artists for current user"""
    client = get_spotify_client_for_current_user()
    if not client:
        return jsonify({'error': 'Not authenticated. Please log in.'}), 401
    
    data = get_artists_fallen_off(client)
    return jsonify(data)


@app.route('/release_year_trends', methods=['GET'])
def release_year_trends():
    """Get release year trends for current user"""
    client = get_spotify_client_for_current_user()
    if not client:
        return jsonify({'error': 'Not authenticated. Please log in.'}), 401
    
    time_range = request.args.get('time_range', 'medium_term')
    data = get_release_year_trends(client, time_range)
    return jsonify(data)


@app.route('/music_variety_by_season', methods=['GET'])
def music_variety_by_season():
    """Get seasonal music variety for current user"""
    client = get_spotify_client_for_current_user()
    if not client:
        return jsonify({'error': 'Not authenticated. Please log in.'}), 401
    
    time_range = request.args.get('time_range', 'medium_term')
    data = get_music_variety_by_season(client, time_range)
    return jsonify(data)


# ============================================================================
# DIAGNOSTIC ROUTES (FOR DEBUGGING)
# ============================================================================

@app.route('/health')
def health():
    """Health check endpoint for monitoring"""
    user = get_current_user()
    return jsonify({
        'status': 'healthy',
        'authenticated': user is not None,
        'user': user.display_name if user else None
    })


@app.route('/db_check')
def db_check():
    """
    Database diagnostic endpoint.
    Verifies schema isolation and table placement.
    """
    try:
        from sqlalchemy import text
        
        results = {
            'status': 'ok',
            'schema': EUTERPE_SCHEMA,
            'tables': [],
            'users_count': 0,
            'public_safety_check': 'passed'
        }
        
        # Check tables in euterpe schema
        with db.engine.connect() as conn:
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = :schema
                ORDER BY table_name
            """), {'schema': EUTERPE_SCHEMA})
            
            results['tables'] = [row[0] for row in result.fetchall()]
            
            # Check for conflicting tables in public
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'user_tokens')
            """))
            
            public_tables = [row[0] for row in result.fetchall()]
            if public_tables:
                results['public_safety_check'] = f'warning: found {public_tables} in public schema (not used)'
        
        # Count users
        results['users_count'] = User.query.count()
        
        return jsonify(results)
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


# ============================================================================
# TEMPLATE HELPER (for inline error pages)
# ============================================================================

def render_template_string(template, **context):
    """Minimal template rendering for error pages"""
    from jinja2 import Template
    return Template(template).render(**context)


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    app.run(debug=True, port=8080)
