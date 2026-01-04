from flask import Flask, render_template, request, jsonify, send_from_directory
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
CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI")
SCOPE = os.getenv("SCOPE")

app = Flask(__name__)

# Set up Spotipy client with OAuth
sp = spotipy.Spotify(
    auth_manager=SpotifyOAuth(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        scope=SCOPE
    )
)

@app.route('/')
def index():
    """
    Render the main dashboard page.
    """
    return render_template('index.html')

@app.route('/favicon.png')
def favicon():
    """
    Serve the favicon from the root directory.
    """
    return send_from_directory(os.path.join(app.root_path, ''), 'favicon.png', mimetype='image/png')

@app.route('/top_albums', methods=['GET'])
def top_albums():
    """
    Endpoint: /top_albums?time_range=short_term/medium_term/long_term
    Fetch top albums from Spotify based on the user-selected time range.
    Returns JSON data.
    """
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_albums(sp, time_range)
    return jsonify(data)

@app.route('/top_songs', methods=['GET'])
def top_songs():
    """
    Endpoint: /top_songs?time_range=short_term/medium_term/long_term
    Fetch top songs from Spotify based on the user-selected time range.
    Returns JSON data.
    """
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_songs(sp, time_range)
    return jsonify(data)

@app.route('/top_artists', methods=['GET'])
def top_artists():
    """
    Endpoint: /top_artists?time_range=short_term/medium_term/long_term
    Fetch top artists from Spotify based on the user-selected time range.
    Returns JSON data.
    """
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_artists(sp, time_range)
    return jsonify(data)

@app.route('/top_playlists', methods=['GET'])
def top_playlists():
    """
    Analyze the user's playlists and return a JSON structure of the
    top 10 playlists containing the largest number of top songs.
    """
    data = analyze_top_playlists(sp)
    return jsonify(data)

@app.route('/hidden_gems', methods=['GET'])
def hidden_gems():
    """
    Endpoint: /hidden_gems?time_range=short_term/medium_term/long_term
    Fetch songs sorted by rarity (lowest popularity first).
    Returns JSON data showing the user's most unique music taste.
    """
    time_range = request.args.get('time_range', 'medium_term')
    data = get_hidden_gems(sp, time_range)
    return jsonify(data)

@app.route('/artists_standing_test_of_time', methods=['GET'])
def artists_standing_test_of_time():
    """
    Identify and return artists that appear in short, medium,
    and long term top artists lists.
    Returns JSON data.
    """
    data = get_artists_standing_test_of_time(sp)
    return jsonify(data)

@app.route('/artists_falling_off', methods=['GET'])
def artists_falling_off():
    """
    Identify artists that appear in the long term list,
    but not in medium or short term lists.
    Returns JSON data.
    """
    data = get_artists_fallen_off(sp)
    return jsonify(data)

@app.route('/release_year_trends', methods=['GET'])
def release_year_trends():
    """
    Endpoint: /release_year_trends?time_range=short_term/medium_term/long_term
    Analyze release year trends of top tracks for the user.
    Returns JSON data (counts by year).
    """
    time_range = request.args.get('time_range', 'medium_term')
    data = get_release_year_trends(sp, time_range)
    return jsonify(data)

@app.route('/music_variety_by_season', methods=['GET'])
def music_variety_by_season():
    """
    Endpoint: /music_variety_by_season?time_range=short_term/medium_term/long_term
    Analyze and return music variety by season based on the track's release month
    and associated genres.
    """
    time_range = request.args.get('time_range', 'medium_term')
    data = get_music_variety_by_season(sp, time_range)
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True)
