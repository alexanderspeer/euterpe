"""
Euterpe - Single-Owner Spotify Analytics Dashboard
Public site showing the owner's Spotify data without requiring visitor authentication
"""

from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, session
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from functools import wraps

# Import database and encryption
from models import db, OwnerToken, EUTERPE_SCHEMA
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

# Conservative connection pooling for Heroku Postgres Essential-0
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,
    'pool_recycle': 300,
    'pool_size': 5,
    'max_overflow': 10,
}

# Initialize database
db.init_app(app)

# Spotify API credentials
SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', os.environ.get('CLIENT_ID', '')).strip()
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', os.environ.get('CLIENT_SECRET', '')).strip()
SPOTIFY_REDIRECT_URI = os.environ.get('SPOTIFY_REDIRECT_URI', os.environ.get('REDIRECT_URI', '')).strip()
SPOTIFY_SCOPE = os.environ.get('SPOTIFY_SCOPE', os.environ.get('SCOPE', '')).strip()

# Admin password for owner-only OAuth
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD')
if not ADMIN_PASSWORD:
    print("WARNING: ADMIN_PASSWORD not set. Admin features will be inaccessible.")

if not all([SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPE]):
    raise ValueError("All Spotify credentials must be set in environment variables")

# ============================================================================
# ADMIN AUTHENTICATION
# ============================================================================

def admin_required(f):
    """
    Decorator to protect admin-only routes.
    Checks for admin_authenticated session flag.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_authenticated'):
            return render_template_string("""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Login Required</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
                    input { padding: 10px; width: 100%; margin: 10px 0; }
                    button { padding: 10px 20px; background: #1DB954; color: white; border: none; cursor: pointer; }
                    button:hover { background: #1ed760; }
                    .error { color: red; margin: 10px 0; }
                </style>
            </head>
            <body>
                <h1>Admin Authentication Required</h1>
                <p>Enter the admin password to access this page.</p>
                {% if error %}
                <div class="error">{{ error }}</div>
                {% endif %}
                <form method="POST" action="/admin/login">
                    <input type="password" name="password" placeholder="Admin Password" required>
                    <button type="submit">Login</button>
                </form>
            </body>
            </html>
            """, error=request.args.get('error'))
        return f(*args, **kwargs)
    return decorated_function


@app.route('/admin/login', methods=['POST'])
def admin_login():
    """Admin login endpoint"""
    password = request.form.get('password')
    if password == ADMIN_PASSWORD:
        session['admin_authenticated'] = True
        return redirect(url_for('admin_dashboard'))
    else:
        return redirect(url_for('admin_dashboard') + '?error=Invalid password')


@app.route('/admin/logout')
def admin_logout():
    """Admin logout"""
    session.pop('admin_authenticated', None)
    return redirect(url_for('index'))


# ============================================================================
# OWNER TOKEN MANAGEMENT
# ============================================================================

def get_spotify_oauth():
    """Create a Spotify OAuth manager (stateless, no cache)"""
    return SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope=SPOTIFY_SCOPE,
        cache_path=None,
        open_browser=False,
        show_dialog=True
    )


def get_owner_token():
    """
    Get the owner token from database.
    Returns OwnerToken object or None if not connected.
    """
    return OwnerToken.query.filter_by(id='owner').first()


def refresh_owner_token_if_needed(owner_token):
    """
    Refresh owner's Spotify token if it's expired or about to expire.
    
    Args:
        owner_token (OwnerToken): The owner token to refresh
        
    Returns:
        bool: True if token is valid, False if refresh failed
    """
    if not owner_token:
        return False
    
    # Check if token expires within the next 2 minutes
    now = datetime.now(timezone.utc)
    expires_at = owner_token.expires_at
    
    # Make expires_at timezone-aware if it isn't
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at > now + timedelta(minutes=2):
        # Token is still valid
        return True
    
    # Token expired or about to expire - refresh it
    print(f"Refreshing owner token (expires at {expires_at})")
    
    try:
        oauth = get_spotify_oauth()
        refresh_token = decrypt_token(owner_token.refresh_token_encrypted)
        
        # Refresh token
        token_info = oauth.refresh_access_token(refresh_token)
        
        # Update token in database
        owner_token.access_token_encrypted = encrypt_token(token_info['access_token'])
        owner_token.expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_info['expires_in'])
        owner_token.updated_at = datetime.now(timezone.utc)
        
        # Update refresh token if provided
        if 'refresh_token' in token_info:
            owner_token.refresh_token_encrypted = encrypt_token(token_info['refresh_token'])
        
        db.session.commit()
        print(f"Owner token refreshed successfully")
        return True
        
    except Exception as e:
        print(f"Error refreshing owner token: {e}")
        return False


def get_owner_spotify_client():
    """
    Get an authenticated Spotify client using the owner's token.
    Automatically refreshes token if needed.
    
    Returns:
        spotipy.Spotify: Authenticated Spotify client, or None if not connected
    """
    owner_token = get_owner_token()
    if not owner_token:
        return None
    
    # Refresh token if needed
    if not refresh_owner_token_if_needed(owner_token):
        return None
    
    # Decrypt access token
    access_token = decrypt_token(owner_token.access_token_encrypted)
    
    # Create Spotify client with the access token
    return spotipy.Spotify(auth=access_token)


# ============================================================================
# ADMIN ROUTES (OWNER ONLY)
# ============================================================================

@app.route('/admin')
@admin_required
def admin_dashboard():
    """
    Admin dashboard - shows connection status and allows owner to connect/reconnect
    """
    owner_token = get_owner_token()
    
    if owner_token:
        # Token exists - show status
        now = datetime.now(timezone.utc)
        expires_at = owner_token.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        is_expired = expires_at < now
        time_remaining = expires_at - now if not is_expired else timedelta(0)
        
        status_html = f"""
        <!DOCTYPE html>
    <html>
        <head>
            <title>Admin Dashboard - Euterpe</title>
            <style>
                body {{ font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }}
                .status {{ padding: 20px; background: #d4edda; border: 1px solid #c3e6cb; margin: 20px 0; }}
                .status.expired {{ background: #f8d7da; border: 1px solid #f5c6cb; }}
                button {{ padding: 10px 20px; background: #1DB954; color: white; border: none; cursor: pointer; margin: 5px; }}
                button:hover {{ background: #1ed760; }}
                .danger {{ background: #dc3545; }}
                .danger:hover {{ background: #c82333; }}
                table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
                th, td {{ padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }}
                th {{ background: #f8f9fa; }}
            </style>
        </head>
        <body>
            <h1>Euterpe Admin Dashboard</h1>
            
            <div class="status {'expired' if is_expired else ''}">
                <h2>Connection Status: {'❌ Expired' if is_expired else '✅ Connected'}</h2>
                <table>
                    <tr><th>Owner</th><td>{owner_token.display_name or 'Unknown'}</td></tr>
                    <tr><th>Spotify ID</th><td>{owner_token.spotify_user_id or 'Unknown'}</td></tr>
                    <tr><th>Token Expires</th><td>{expires_at.strftime('%Y-%m-%d %H:%M:%S UTC')}</td></tr>
                    <tr><th>Time Remaining</th><td>{'Expired' if is_expired else f'{int(time_remaining.total_seconds() / 3600)} hours'}</td></tr>
                    <tr><th>Scope</th><td>{owner_token.scope or 'Unknown'}</td></tr>
                    <tr><th>Last Updated</th><td>{owner_token.updated_at.strftime('%Y-%m-%d %H:%M:%S UTC')}</td></tr>
                </table>
            </div>
            
            <h3>Actions</h3>
            <p>
                <a href="/admin/connect"><button>Reconnect Spotify Account</button></a>
                <a href="/"><button>View Dashboard</button></a>
                <a href="/admin/logout"><button>Logout</button></a>
            </p>
            
            <h3>Notes</h3>
            <ul>
                <li>Tokens are automatically refreshed before expiration</li>
                <li>Reconnecting will update your credentials</li>
                <li>All site visitors use your Spotify data</li>
            </ul>
        </body>
    </html>
        """
    else:
        # No token - prompt to connect
        status_html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Dashboard - Euterpe</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                .status { padding: 20px; background: #fff3cd; border: 1px solid #ffeeba; margin: 20px 0; }
                button { padding: 10px 20px; background: #1DB954; color: white; border: none; cursor: pointer; margin: 5px; }
                button:hover { background: #1ed760; }
            </style>
        </head>
        <body>
            <h1>Euterpe Admin Dashboard</h1>
            
            <div class="status">
                <h2>⚠️ Not Connected</h2>
                <p>No owner Spotify account is connected. The site cannot display data until you connect.</p>
            </div>
            
            <h3>First-Time Setup</h3>
            <p>
                <a href="/admin/connect"><button>Connect Spotify Account</button></a>
                <a href="/admin/logout"><button>Logout</button></a>
            </p>
            
            <h3>What Happens Next?</h3>
            <ol>
                <li>You'll be redirected to Spotify to authorize the app</li>
                <li>Your tokens will be encrypted and stored securely</li>
                <li>The public site will show your Spotify data</li>
                <li>Tokens will refresh automatically</li>
            </ol>
            </body>
        </html>
        """
    
    return status_html


@app.route('/admin/connect')
@admin_required
def admin_connect():
    """
    Initiate Spotify OAuth for owner.
    Admin-only route to prevent unauthorized token replacement.
    """
    oauth = get_spotify_oauth()
    auth_url = oauth.get_authorize_url()
    return redirect(auth_url)


@app.route('/callback')
def callback():
    """
    OAuth callback - handles Spotify authorization response for owner.
    Stores owner token in database.
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
            <p><a href="/admin" style="padding: 10px 20px; background: #1DB954; color: white; text-decoration: none; border-radius: 5px;">Back to Admin</a></p>
            </body>
        </html>
        """, error=error)
    
    # Get authorization code
    code = request.args.get('code')
    if not code:
        return redirect(url_for('admin_dashboard'))
    
    try:
        # Exchange code for tokens
        oauth = get_spotify_oauth()
        token_info = oauth.get_access_token(code, as_dict=True)
        
        # Get owner profile from Spotify
        temp_sp = spotipy.Spotify(auth=token_info['access_token'])
        spotify_user = temp_sp.current_user()
        
        # Calculate token expiration
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_info['expires_in'])
        
        # Find or create owner token (only one row, id='owner')
        owner_token = get_owner_token()
        
        if owner_token:
            # Update existing token
            owner_token.access_token_encrypted = encrypt_token(token_info['access_token'])
            owner_token.refresh_token_encrypted = encrypt_token(token_info['refresh_token'])
            owner_token.expires_at = expires_at
            owner_token.scope = token_info.get('scope', SPOTIFY_SCOPE)
            owner_token.spotify_user_id = spotify_user['id']
            owner_token.display_name = spotify_user.get('display_name', spotify_user['id'])
            owner_token.updated_at = datetime.now(timezone.utc)
        else:
            # Create new owner token
            owner_token = OwnerToken(
                id='owner',
                access_token_encrypted=encrypt_token(token_info['access_token']),
                refresh_token_encrypted=encrypt_token(token_info['refresh_token']),
                expires_at=expires_at,
                token_type=token_info.get('token_type', 'Bearer'),
                scope=token_info.get('scope', SPOTIFY_SCOPE),
                spotify_user_id=spotify_user['id'],
                display_name=spotify_user.get('display_name', spotify_user['id'])
            )
            db.session.add(owner_token)
        
        db.session.commit()
        
        print(f"Owner token updated: {owner_token.display_name} ({owner_token.spotify_user_id})")
        
        # Redirect back to admin with success message
        return render_template_string("""
        <!DOCTYPE html>
            <html>
        <head><title>Connection Successful</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>✅ Connection Successful!</h1>
            <p>Your Spotify account has been connected.</p>
            <p>Account: <strong>{{ display_name }}</strong></p>
            <p><a href="/admin" style="padding: 10px 20px; background: #1DB954; color: white; text-decoration: none; border-radius: 5px;">Back to Admin</a></p>
            <script>setTimeout(function(){ window.location.href = '/admin'; }, 3000);</script>
                </body>
            </html>
        """, display_name=owner_token.display_name)
        
    except Exception as e:
        print(f"Error in OAuth callback: {e}")
        return render_template_string("""
        <!DOCTYPE html>
        <html>
        <head><title>Authorization Error</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>Authorization Error</h1>
            <p>{{ error }}</p>
            <p><a href="/admin" style="padding: 10px 20px; background: #1DB954; color: white; text-decoration: none; border-radius: 5px;">Back to Admin</a></p>
        </body>
        </html>
        """, error=str(e))


# ============================================================================
# PUBLIC ROUTES (NO AUTHENTICATION REQUIRED)
# ============================================================================

@app.route('/')
def index():
    """
    Main dashboard page.
    Public - no authentication required.
    Shows owner's Spotify data to all visitors.
    """
    owner_token = get_owner_token()
    
    if not owner_token:
        # No owner connected yet
        return render_template_string("""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Euterpe - Not Connected</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; }
                h1 { color: #1DB954; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Euterpe</h1>
                <h2>Music Analytics Dashboard</h2>
                <p>This site is not yet connected to a Spotify account.</p>
                <p>If you're the site owner, please visit the admin panel to connect your account.</p>
            </div>
            </body>
        </html>
        """)
    
    return render_template('index.html', owner=owner_token)


@app.route('/favicon.png')
def favicon():
    """Serve favicon"""
    return send_from_directory(os.path.join(app.root_path, ''), 'favicon.png', mimetype='image/png')


@app.route('/paperclip.webp')
def paperclip():
    """Serve paperclip image"""
    return send_from_directory(os.path.join(app.root_path, ''), 'paperclip.webp', mimetype='image/webp')


# ============================================================================
# PUBLIC API ROUTES (USE OWNER TOKEN)
# ============================================================================

def require_owner_token(f):
    """
    Decorator to ensure owner token exists and is valid.
    Returns 503 if not connected.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client = get_owner_spotify_client()
        if not client:
            return jsonify({
                'error': 'Site not connected to Spotify. Please contact the site owner.'
            }), 503
        return f(client, *args, **kwargs)
    return decorated_function


@app.route('/top_albums', methods=['GET'])
@require_owner_token
def top_albums(client):
    """Get top albums (owner's data)"""
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_albums(client, time_range)
    return jsonify(data)


@app.route('/top_songs', methods=['GET'])
@require_owner_token
def top_songs(client):
    """Get top songs (owner's data)"""
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_songs(client, time_range)
    return jsonify(data)


@app.route('/top_artists', methods=['GET'])
@require_owner_token
def top_artists(client):
    """Get top artists (owner's data)"""
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_artists(client, time_range)
    return jsonify(data)


@app.route('/top_playlists', methods=['GET'])
@require_owner_token
def top_playlists(client):
    """Get top playlists (owner's data)"""
    data = analyze_top_playlists(client)
    return jsonify(data)


@app.route('/hidden_gems', methods=['GET'])
@require_owner_token
def hidden_gems(client):
    """Get hidden gems (owner's data)"""
    time_range = request.args.get('time_range', 'medium_term')
    data = get_hidden_gems(client, time_range)
    return jsonify(data)


@app.route('/artists_standing_test_of_time', methods=['GET'])
@require_owner_token
def artists_standing_test_of_time(client):
    """Get timeless artists (owner's data)"""
    data = get_artists_standing_test_of_time(client)
    return jsonify(data)


@app.route('/artists_falling_off', methods=['GET'])
@require_owner_token
def artists_falling_off(client):
    """Get trending down artists (owner's data)"""
    data = get_artists_fallen_off(client)
    return jsonify(data)


@app.route('/release_year_trends', methods=['GET'])
@require_owner_token
def release_year_trends(client):
    """Get release year trends (owner's data)"""
    time_range = request.args.get('time_range', 'medium_term')
    data = get_release_year_trends(client, time_range)
    return jsonify(data)


@app.route('/music_variety_by_season', methods=['GET'])
@require_owner_token
def music_variety_by_season(client):
    """Get seasonal music variety (owner's data)"""
    time_range = request.args.get('time_range', 'medium_term')
    data = get_music_variety_by_season(client, time_range)
    return jsonify(data)


# ============================================================================
# DIAGNOSTIC ROUTES
# ============================================================================

@app.route('/health')
def health():
    """Health check endpoint"""
    owner_token = get_owner_token()
    return jsonify({
        'status': 'healthy',
        'connected': owner_token is not None,
        'owner': owner_token.display_name if owner_token else None
    })


@app.route('/db_check')
def db_check():
    """Database diagnostic endpoint - verifies schema isolation"""
    try:
        from sqlalchemy import text
        
        results = {
            'status': 'ok',
            'schema': EUTERPE_SCHEMA,
            'tables': [],
            'owner_connected': False,
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
                AND table_name IN ('users', 'user_tokens', 'owner_tokens')
            """))
            
            public_tables = [row[0] for row in result.fetchall()]
            if public_tables:
                results['public_safety_check'] = f'warning: found {public_tables} in public (not used)'
        
        # Check if owner is connected
        owner_token = get_owner_token()
        results['owner_connected'] = owner_token is not None
        
        return jsonify(results)
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


# ============================================================================
# TEMPLATE HELPER
# ============================================================================

def render_template_string(template, **context):
    """Minimal template rendering for simple pages"""
    from jinja2 import Template
    return Template(template).render(**context)


# ============================================================================
# ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    app.run(debug=True, port=8080)
