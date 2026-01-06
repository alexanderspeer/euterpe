# Euterpe - Owner Mode Deployment Guide

## Overview

Euterpe now operates in **single-owner mode**: the site publicly displays YOUR Spotify data without requiring visitors to authenticate. Only you (the owner) can connect/reconnect the Spotify account via an admin-protected interface.

---

## How It Works

```
Public Visitor → Views Site → Sees Owner's Spotify Data
                                    ↓
                            (No Spotify login required)

Site Owner → /admin → Enter Password → Connect Spotify → Tokens Stored
                                                              ↓
                                                    (Encrypted in PostgreSQL)
```

---

## Required Environment Variables

### Spotify Credentials
```bash
SPOTIFY_CLIENT_ID="your_spotify_client_id"
SPOTIFY_CLIENT_SECRET="your_spotify_client_secret"
SPOTIFY_REDIRECT_URI="https://euterpe-c0dcbd4f17ec.herokuapp.com/callback"
SPOTIFY_SCOPE="user-read-recently-played user-top-read user-read-private user-read-email playlist-read-private playlist-read-collaborative"
```

### Security Keys
```bash
SECRET_KEY="<generated_secret_key>"        # Flask session signing
ENCRYPTION_KEY="<generated_encryption_key>" # Token encryption
ADMIN_PASSWORD="<your_admin_password>"      # Admin access password
```

### Database
```bash
DATABASE_URL="<automatically_set_by_heroku>"
```

---

## Setup Instructions

### 1. Generate Security Keys

```bash
# Generate SECRET_KEY
python -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"

# Generate ENCRYPTION_KEY
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"
```

### 2. Set Heroku Config Vars

```bash
# Set all config vars at once
heroku config:set \
  SPOTIFY_CLIENT_ID="<your_client_id>" \
  SPOTIFY_CLIENT_SECRET="<your_client_secret>" \
  SPOTIFY_REDIRECT_URI="https://euterpe-c0dcbd4f17ec.herokuapp.com/callback" \
  SPOTIFY_SCOPE="user-read-recently-played user-top-read user-read-private user-read-email playlist-read-private playlist-read-collaborative" \
  SECRET_KEY="<generated_secret_key>" \
  ENCRYPTION_KEY="<generated_encryption_key>" \
  ADMIN_PASSWORD="<your_chosen_password>" \
  --app euterpe
```

### 3. Update Spotify App Settings

1. Go to https://developer.spotify.com/dashboard
2. Select your Spotify app
3. Click "Edit Settings"
4. Under "Redirect URIs", add:
   ```
   https://euterpe-c0dcbd4f17ec.herokuapp.com/callback
   ```
5. Save

### 4. Deploy to Heroku

```bash
cd /Users/alexanderspeer/Desktop/euterpe
git add .
git commit -m "Convert to single-owner mode"
git push heroku main
```

### 5. Initialize Database

```bash
heroku run python init_db.py --app euterpe
```

Expected output should show:
- ✓ Schema 'euterpe' created
- ✓ Tables created (including `owner_tokens`)

---

## Connecting Your Spotify Account

### First-Time Connection

1. Visit: https://euterpe-c0dcbd4f17ec.herokuapp.com/admin
2. Enter your `ADMIN_PASSWORD`
3. Click "Connect Spotify Account"
4. Authorize on Spotify
5. Done! Your tokens are now stored (encrypted)

### Reconnecting (Token Rotation)

To update your credentials or if tokens expire:

1. Visit: https://euterpe-c0dcbd4f17ec.herokuapp.com/admin
2. Enter your `ADMIN_PASSWORD`
3. Click "Reconnect Spotify Account"
4. Authorize on Spotify again
5. New tokens replace old ones

---

## Public Access

Public visitors can:
- ✅ View the dashboard at `/`
- ✅ See all your Spotify analytics
- ✅ Browse tracks, artists, albums, playlists
- ✅ View charts and trends

Public visitors CANNOT:
- ❌ Log in with their own Spotify
- ❌ Modify your data
- ❌ Access admin panel
- ❌ Change connected account

---

## Admin Panel Features

**URL:** https://euterpe-c0dcbd4f17ec.herokuapp.com/admin

**Access:** Requires `ADMIN_PASSWORD`

**Features:**
- View connection status
- See token expiration time
- View connected Spotify account details
- Connect/reconnect Spotify account
- See last token update time

---

## Token Management

### Automatic Refresh

Tokens are automatically refreshed:
- When within 2 minutes of expiration
- Before each API call
- Refreshed tokens saved encrypted to database
- No manual intervention required

### Token Security

- ✅ Encrypted at rest (Fernet AES-128)
- ✅ Never exposed in logs
- ✅ Never sent to client
- ✅ Stored in PostgreSQL (`euterpe.owner_tokens`)
- ✅ Separate from other apps (schema isolation)

---

## Database Schema

### OwnerToken Table (euterpe.owner_tokens)

Single row (id='owner') containing:
- `access_token_encrypted` - Encrypted access token
- `refresh_token_encrypted` - Encrypted refresh token
- `expires_at` - Token expiration timestamp
- `spotify_user_id` - Your Spotify user ID
- `display_name` - Your Spotify display name
- `scope` - Granted permissions
- `created_at`, `updated_at` - Timestamps

### Legacy Tables (Unused)

- `euterpe.users` - Kept for database safety, not used
- `euterpe.user_tokens` - Kept for database safety, not used

**Important:** These tables are NOT dropped to maintain database integrity in the shared environment.

---

## Testing

### 1. Test Public Access (No Auth)

```bash
# Visit public site
open https://euterpe-c0dcbd4f17ec.herokuapp.com/

# Should see dashboard without login prompt
```

### 2. Test Admin Access

```bash
# Visit admin panel
open https://euterpe-c0dcbd4f17ec.herokuapp.com/admin

# Should prompt for password
```

### 3. Test API Endpoints

```bash
# Should work without authentication
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/top_songs?time_range=short_term

# Should return JSON with owner's top songs
```

### 4. Test Token Refresh

```bash
# Monitor logs while using the app
heroku logs --tail --app euterpe

# Look for "Refreshing owner token" message (happens near expiration)
```

---

## Monitoring

### Check Connection Status

```bash
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "connected": true,
  "owner": "Your Spotify Name"
}
```

### Check Database

```bash
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check
```

Expected response:
```json
{
  "status": "ok",
  "schema": "euterpe",
  "tables": ["owner_tokens", "user_tokens", "users"],
  "owner_connected": true,
  "public_safety_check": "passed"
}
```

### View Logs

```bash
heroku logs --tail --app euterpe
```

Look for:
- "Owner token updated: [your name]" - Connection successful
- "Refreshing owner token" - Automatic refresh
- No ERROR messages

---

## Troubleshooting

### Issue: "Site not connected to Spotify"

**Symptoms:** Public site shows "not connected" message

**Solution:**
1. Go to `/admin`
2. Enter admin password
3. Click "Connect Spotify Account"
4. Complete OAuth flow

### Issue: "Invalid admin password"

**Symptoms:** Cannot access `/admin`

**Solution:**
```bash
# Check if ADMIN_PASSWORD is set
heroku config:get ADMIN_PASSWORD --app euterpe

# If not set or wrong:
heroku config:set ADMIN_PASSWORD="your_new_password" --app euterpe
```

### Issue: Token refresh fails

**Symptoms:** API returns 503 errors

**Solution:**
1. Check logs: `heroku logs --tail --app euterpe`
2. Look for refresh errors
3. Reconnect via `/admin` → "Reconnect Spotify Account"

### Issue: "OwnerToken table not found"

**Symptoms:** Database errors on startup

**Solution:**
```bash
# Re-run database initialization
heroku run python init_db.py --app euterpe
```

---

## Security Considerations

### Who Can Do What?

| Action | Public Visitor | Site Owner |
|--------|---------------|------------|
| View dashboard | ✅ | ✅ |
| See Spotify data | ✅ (owner's) | ✅ (own) |
| Access `/admin` | ❌ | ✅ (with password) |
| Connect Spotify | ❌ | ✅ |
| Modify data | ❌ | ❌ (read-only) |

### Protecting Your Account

**Do:**
- ✅ Use a strong `ADMIN_PASSWORD`
- ✅ Keep Spotify credentials secret
- ✅ Rotate admin password periodically
- ✅ Monitor logs for unauthorized access attempts

**Don't:**
- ❌ Share your `ADMIN_PASSWORD`
- ❌ Commit credentials to git
- ❌ Use weak passwords
- ❌ Allow untrusted access to Heroku dashboard

---

## Scopes Explained

Current scopes (read-only):
- `user-read-recently-played` - Recently played tracks
- `user-top-read` - Top tracks, artists, albums
- `user-read-private` - User profile info
- `user-read-email` - Email address
- `playlist-read-private` - Private playlists
- `playlist-read-collaborative` - Collaborative playlists

**Note:** All scopes are read-only. The app cannot:
- Modify playlists
- Follow/unfollow artists
- Save/unsave tracks
- Control playback
- Access private messages

---

## Updating Scopes

To add or remove Spotify permissions:

1. Update `SPOTIFY_SCOPE` in Heroku:
   ```bash
   heroku config:set SPOTIFY_SCOPE="new scopes here" --app euterpe
   ```

2. Reconnect your account:
   - Visit `/admin`
   - Click "Reconnect Spotify Account"
   - Approve new permissions

3. New scopes take effect immediately

---

## Backup & Recovery

### Backup Tokens

Tokens are stored in PostgreSQL and backed up automatically by Heroku (7-day retention for Essential-0).

### Manual Backup

```bash
heroku pg:backups:capture --app euterpe
```

### Restore from Backup

```bash
heroku pg:backups:restore <backup_id> DATABASE_URL --app euterpe
```

### Recreate Connection

If tokens are lost:
1. Visit `/admin`
2. Enter password
3. Connect Spotify (will create new tokens)

---

## Cost & Limits

### Spotify API Limits

- 30 requests per second
- Rate limited per token (yours)
- Public visitors share your rate limit

**Recommendation:** Consider caching responses if traffic is high.

### Database Storage

**Heroku Postgres Essential-0:**
- 1 GB total storage
- Single owner token: ~1 KB
- Plenty of room for future features

### Dyno Hours

**Heroku Basic:**
- 1 dyno = $7/month
- Unlimited hours
- Auto-sleep after 30 minutes inactivity
- Wakes on request

---

## Migration Notes

### From Multi-User to Owner Mode

Changes made:
- ✅ Removed per-user session authentication
- ✅ Added `OwnerToken` table
- ✅ Added admin password protection
- ✅ Made all routes public (use owner token)
- ✅ Kept old tables for safety (unused)

**No data loss:** Old User/UserToken tables remain in database, just unused.

---

## Next Steps

1. **Deploy and Connect**
   - Follow setup instructions above
   - Connect your Spotify account

2. **Test Public Access**
   - Share the URL with friends
   - Confirm they can view without login

3. **Customize UI** (Optional)
   - Add your name/photo to dashboard
   - Customize colors/branding
   - Add social links

4. **Monitor Usage**
   - Check logs regularly
   - Monitor token refresh
   - Watch for errors

---

## Support

**Health Check:** https://euterpe-c0dcbd4f17ec.herokuapp.com/health

**Database Check:** https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check

**Admin Panel:** https://euterpe-c0dcbd4f17ec.herokuapp.com/admin

**Logs:** `heroku logs --tail --app euterpe`

---

**Last Updated:** January 2026
**Mode:** Single-Owner (Public Display)
**Database:** Shared PostgreSQL (Schema Isolated)

