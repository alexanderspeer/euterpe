# Euterpe Dashboard

A Spotify-inspired music analytics dashboard. Named after Euterpe (the Greek muse of music), it shows you stuff about your listening habits that Spotify doesn't.

**Note:** Right now, this app only displays my Spotify data. I originally built it so anyone could connect their own Spotify account and see their analytics. Unfortunately, Spotify changed their API policies a while back - individual developers can't use the Spotify API on deployed apps anymore (you need a company account now). So I had to pivot: instead of letting other people see their own data, the app now just shows my listening stats to anyone who visits. If you want to see your own data, you'll need to run it locally with your own API credentials.

## What it does

Basically, it connects to your Spotify account and shows you:
- Your top tracks, artists, and albums (with album art)
- Hidden gems - tracks with really low popularity scores that you love
- Which playlists have the most of your top songs
- Artists that stand the test of time vs ones you're falling out of love with
- How your music taste changes by season
- Release year trends

The UI looks like Spotify because I wanted it to feel familiar. Dark theme, smooth transitions, that whole thing.

## Getting Started

### What you'll need
- Python 3.8+ (probably have this already)
- A Spotify Developer account (free, takes 5 minutes)
- Git (to clone this repo)

### Setup

1. Clone it:
```bash
git clone https://github.com/yourusername/euterpe_dashboard.git
cd euterpe_dashboard
```

2. Set up a virtual environment (trust me, you want this):
```bash
python -m venv venv

# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Get Spotify API credentials:
   - Go to https://developer.spotify.com/dashboard
   - Create a new app (call it whatever you want)
   - Set the redirect URI to `http://localhost:5000`
   - Copy your Client ID and Client Secret

5. Create a `.env` file in the root directory:
```env
CLIENT_ID=your_client_id_here
CLIENT_SECRET=your_client_secret_here
REDIRECT_URI=http://localhost:5000
SCOPE=user-top-read user-read-recently-played user-library-read playlist-read-private playlist-read-collaborative
```

6. Run it:
```bash
python app.py
```

7. Open http://localhost:5000 in your browser

## Project Structure

```
euterpe/
├── app.py              # Main Flask app and routes
├── logic.py            # All the Spotify API stuff
├── models.py           # Database models
├── encryption.py       # For storing tokens securely
├── init_db.py          # Sets up the database
├── requirements.txt    # Python packages
├── templates/
│   └── index.html      # The dashboard page
└── static/
    ├── js/
    │   └── script.js   # Frontend logic
    └── css/
        └── 98.css      # Styles (Windows 98 inspired)
```

## API Endpoints

The app has a few endpoints if you want to use them directly:

- `/top_songs?time_range=short_term|medium_term|long_term`
- `/top_artists?time_range=short_term|medium_term|long_term`
- `/top_albums?time_range=short_term|medium_term|long_term`
- `/hidden_gems?time_range=short_term|medium_term|long_term`
- `/top_playlists`
- `/artists_standing_test_of_time`
- `/artists_falling_off`
- `/release_year_trends?time_range=...`
- `/music_variety_by_season?time_range=...`

Time ranges:
- `short_term` = last 4 weeks
- `medium_term` = last 6 months
- `long_term` = last year or so

## Privacy & Security

- We don't store any of your data. Everything is fetched from Spotify in real-time.
- Your API credentials live in the `.env` file (which isn't tracked by git).
- The app only asks for read-only permissions - it can't modify your playlists or anything like that.

## Deployment

For local development, just run `python app.py`.

For production, you'll probably want to use Gunicorn:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

Or use the Procfile if you're deploying to Heroku or similar.

Make sure to update your `.env` with production values and set `REDIRECT_URI` to your actual domain.

## Development

If you want to add features:
- Backend stuff goes in `logic.py`
- Routes go in `app.py`
- Frontend stuff is in `templates/index.html` and `static/js/script.js`

I tried to keep the code somewhat organized, but it's not perfect. Feel free to refactor if you want.

## Troubleshooting

**"Unauthorized" error**
- Double check your `.env` file has the right credentials
- Make sure your Spotify app's redirect URI matches what's in `.env`
- If your app is in development mode, you might need to add yourself to the allowed users list in Spotify's dashboard

**No data showing**
- You might not have enough listening history yet. Try the different time ranges.
- Check the browser console for JavaScript errors.
- Make sure you've actually listened to music on Spotify (sounds obvious but you never know)

**Favicon not loading**
- It's probably cached. Try hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)

## Things I might add later

- Export your data as CSV/JSON
- Compare stats with friends
- Generate playlists based on your analytics
- More chart types
- Custom themes

## License

MIT License. Do whatever you want with it.

## Credits

Built with Flask, Spotipy, and too much coffee. Thanks to Spotify for having a decent API and not being too annoying about rate limits.

---

Made by someone who spends way too much time thinking about music.
