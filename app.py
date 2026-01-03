from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import os
from dotenv import load_dotenv
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

# Load environment variables from .env file
load_dotenv()

# Spotify API credentials from environment variables
# Strip whitespace to avoid issues
CLIENT_ID = os.getenv("CLIENT_ID", "").strip()
CLIENT_SECRET = os.getenv("CLIENT_SECRET", "").strip()
REDIRECT_URI = os.getenv("REDIRECT_URI", "").strip()
SCOPE = os.getenv("SCOPE", "").strip()

app = Flask(__name__)

# Use the redirect URI exactly as specified in .env
# Make sure it matches exactly what's in your Spotify dashboard

# Set up Spotipy client with OAuth
# Use cache_path to store tokens and avoid re-authentication
# Note: We'll handle the callback through Flask, but Spotipy may still try to start a server
print(f"Using redirect URI: {REDIRECT_URI}")  # Debug: show what redirect URI we're using
auth_manager = SpotifyOAuth(
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    redirect_uri=REDIRECT_URI,
    scope=SCOPE,
    cache_path=".spotify_cache",
    open_browser=False
)

sp = spotipy.Spotify(auth_manager=auth_manager)

def get_spotify_client():
    """
    Get a Spotify client, ensuring we have a valid token.
    Returns None if authentication is needed.
    """
    try:
        # Check if we have a cached token
        token_info = auth_manager.get_cached_token()
        if not token_info:
            # No cached token, need authentication
            return None
        
        # Check if token is expired
        if auth_manager.is_token_expired(token_info):
            # Try to refresh the token
            token_info = auth_manager.refresh_access_token(token_info['refresh_token'])
        
        # If we have a valid token, return the client
        if token_info:
            return sp
        return None
    except Exception as e:
        # If we can't get a token, authentication is needed
        return None

@app.route('/')
def index():
    """
    Render the main dashboard page.
    Check if user is authenticated, if not, redirect to auth.
    """
    # Check if user is authenticated
    client = get_spotify_client()
    if not client:
        # Not authenticated, redirect to auth
        return redirect(url_for('auth'))
    return render_template('index.html')

@app.route('/debug')
def debug():
    """
    Debug page to show the exact redirect URI being used.
    """
    from urllib.parse import urlencode, quote
    auth_url = auth_manager.get_authorize_url()
    debug_info = f'''
    <html>
        <head><title>Debug Info</title></head>
        <body style="font-family: monospace; padding: 20px; background: #f5f5f5;">
            <h1>Debug Information</h1>
            <h2>Redirect URI from .env:</h2>
            <p style="background: white; padding: 10px; border: 1px solid #ccc;">{REDIRECT_URI}</p>
            <p><strong>Length:</strong> {len(REDIRECT_URI)} characters</p>
            <p><strong>Encoded:</strong> {quote(REDIRECT_URI, safe='')}</p>
            
            <h2>Full Authorization URL:</h2>
            <p style="background: white; padding: 10px; border: 1px solid #ccc; word-break: break-all;">{auth_url}</p>
            
            <h2>Instructions:</h2>
            <ol>
                <li>Copy the "Redirect URI from .env" value above</li>
                <li>Go to <a href="https://developer.spotify.com/dashboard" target="_blank">Spotify Dashboard</a></li>
                <li>Click on your app "Euterpe - Spotify DA"</li>
                <li>Click "Edit Settings"</li>
                <li>Under "Redirect URIs", make sure you have EXACTLY this (copy-paste it):</li>
                <li style="background: yellow; padding: 10px; margin: 10px 0; font-family: monospace;">{REDIRECT_URI}</li>
                <li>Click "Add" then "Save"</li>
                <li>Wait 1-2 minutes for changes to propagate</li>
                <li>Try <a href="/auth">/auth</a> again</li>
            </ol>
            
            <p><a href="/auth">Try Authorization</a> | <a href="/">Back to Dashboard</a></p>
        </body>
    </html>
    '''
    return debug_info

@app.route('/auth')
def auth():
    """
    Initiate Spotify OAuth flow by redirecting to Spotify's authorization page.
    """
    try:
        auth_url = auth_manager.get_authorize_url()
        print(f"Redirecting to Spotify authorization URL: {auth_url}")  # Debug
        print(f"Redirect URI being used: {REDIRECT_URI}")  # Debug
        return redirect(auth_url)
    except Exception as e:
        error_html = f'''
        <html>
            <head><title>Authorization Error</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>❌ Error starting authorization</h1>
                <p>{str(e)}</p>
                <p>Please check your .env file and Spotify dashboard settings.</p>
                <p>Redirect URI being used: {REDIRECT_URI}</p>
                <p><a href="/debug">View Debug Info</a></p>
            </body>
        </html>
        '''
        return error_html, 500

@app.route('/favicon.png')
def favicon():
    """
    Serve the favicon from the root directory.
    """
    return send_from_directory(os.path.join(app.root_path, ''), 'favicon.png', mimetype='image/png')

@app.route('/callback')
def callback():
    """
    Handle Spotify OAuth callback.
    This route receives the authorization code from Spotify.
    """
    # Get the authorization code from the callback
    code = request.args.get('code')
    error = request.args.get('error')
    
    if error:
        error_html = f'''
        <html>
            <head><title>Authorization Failed</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>❌ Authorization failed</h1>
                <p>Error: {error}</p>
                <p><a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1DB954; color: white; text-decoration: none; border-radius: 5px;">Try again</a></p>
            </body>
        </html>
        '''
        return error_html, 400
    
    if code:
        try:
            # Exchange the code for a token and cache it
            token_info = auth_manager.get_access_token(code, as_dict=True)
            # The token is automatically cached by Spotipy
            return '''
            <html>
                <head><title>Authorization Successful</title></head>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h1>✓ Authorization successful!</h1>
                    <p>Redirecting to dashboard...</p>
                    <p><a href="/">Go to Dashboard</a></p>
                    <script>setTimeout(function(){ window.location.href = '/'; }, 2000);</script>
                </body>
            </html>
            '''
        except Exception as e:
            error_html = f'''
            <html>
                <head><title>Token Exchange Error</title></head>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h1>❌ Error exchanging token</h1>
                    <p>{str(e)}</p>
                    <p><a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1DB954; color: white; text-decoration: none; border-radius: 5px;">Try again</a></p>
                </body>
            </html>
            '''
            return error_html, 500
    else:
        # No code and no error - user might have accessed /callback directly
        return '''
        <html>
            <head><title>Authorization Required</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>Authorization Required</h1>
                <p>Please start the authorization process first.</p>
                <p><a href="/auth" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1DB954; color: white; text-decoration: none; border-radius: 5px;">Authorize with Spotify</a></p>
                <p><a href="/">Go to Dashboard</a></p>
            </body>
        </html>
        ''', 400

@app.route('/top_albums', methods=['GET'])
def top_albums():
    """
    Endpoint: /top_albums?time_range=short_term/medium_term/long_term
    Fetch top albums from Spotify based on the user-selected time range.
    Returns JSON data.
    """
    client = get_spotify_client()
    if not client:
        return jsonify({'error': 'Not authenticated. Please visit /auth first.'}), 401
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_albums(client, time_range)
    return jsonify(data)

@app.route('/top_songs', methods=['GET'])
def top_songs():
    """
    Endpoint: /top_songs?time_range=short_term/medium_term/long_term
    Fetch top songs from Spotify based on the user-selected time range.
    Returns JSON data.
    """
    client = get_spotify_client()
    if not client:
        return jsonify({'error': 'Not authenticated. Please visit /auth first.'}), 401
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_songs(client, time_range)
    return jsonify(data)

@app.route('/top_artists', methods=['GET'])
def top_artists():
    """
    Endpoint: /top_artists?time_range=short_term/medium_term/long_term
    Fetch top artists from Spotify based on the user-selected time range.
    Returns JSON data.
    """
    client = get_spotify_client()
    if not client:
        return jsonify({'error': 'Not authenticated. Please visit /auth first.'}), 401
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_artists(client, time_range)
    return jsonify(data)

@app.route('/top_playlists', methods=['GET'])
def top_playlists():
    """
    Analyze the user's playlists and return a JSON structure of the
    top 10 playlists containing the largest number of top songs.
    """
    client = get_spotify_client()
    if not client:
        return jsonify({'error': 'Not authenticated. Please visit /auth first.'}), 401
    data = analyze_top_playlists(client)
    return jsonify(data)

@app.route('/hidden_gems', methods=['GET'])
def hidden_gems():
    """
    Endpoint: /hidden_gems?time_range=short_term/medium_term/long_term
    Fetch songs sorted by rarity (lowest popularity first).
    Returns JSON data showing the user's most unique music taste.
    """
    client = get_spotify_client()
    if not client:
        return jsonify({'error': 'Not authenticated. Please visit /auth first.'}), 401
    time_range = request.args.get('time_range', 'medium_term')
    data = get_hidden_gems(client, time_range)
    return jsonify(data)

@app.route('/artists_standing_test_of_time', methods=['GET'])
def artists_standing_test_of_time():
    """
    Identify and return artists that appear in short, medium,
    and long term top artists lists.
    Returns JSON data.
    """
    client = get_spotify_client()
    if not client:
        return jsonify({'error': 'Not authenticated. Please visit /auth first.'}), 401
    data = get_artists_standing_test_of_time(client)
    return jsonify(data)

@app.route('/artists_falling_off', methods=['GET'])
def artists_falling_off():
    """
    Identify artists that appear in the long term list,
    but not in medium or short term lists.
    Returns JSON data.
    """
    client = get_spotify_client()
    if not client:
        return jsonify({'error': 'Not authenticated. Please visit /auth first.'}), 401
    data = get_artists_fallen_off(client)
    return jsonify(data)

@app.route('/release_year_trends', methods=['GET'])
def release_year_trends():
    """
    Endpoint: /release_year_trends?time_range=short_term/medium_term/long_term
    Analyze release year trends of top tracks for the user.
    Returns JSON data (counts by year).
    """
    client = get_spotify_client()
    if not client:
        return jsonify({'error': 'Not authenticated. Please visit /auth first.'}), 401
    time_range = request.args.get('time_range', 'medium_term')
    data = get_release_year_trends(client, time_range)
    return jsonify(data)

@app.route('/music_variety_by_season', methods=['GET'])
def music_variety_by_season():
    """
    Endpoint: /music_variety_by_season?time_range=short_term/medium_term/long_term
    Analyze and return music variety by season based on the track's release month
    and associated genres.
    """
    client = get_spotify_client()
    if not client:
        return jsonify({'error': 'Not authenticated. Please visit /auth first.'}), 401
    time_range = request.args.get('time_range', 'medium_term')
    data = get_music_variety_by_season(client, time_range)
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True, port=8080)
