# Euterpe - Heroku Deployment Guide

## Multi-User Production Deployment with PostgreSQL Schema Isolation

This guide walks you through deploying Euterpe to Heroku with full multi-user support, using a shared PostgreSQL database with strict schema isolation.

---

## Pre-Deployment Checklist

### 1. Environment Preparation

Generate required secrets:

```bash
# Generate Flask SECRET_KEY
python -c "import secrets; print(secrets.token_hex(32))"

# Generate ENCRYPTION_KEY for token encryption
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Save these values** - you'll need them for Heroku config.

### 2. Spotify App Configuration

1. Go to https://developer.spotify.com/dashboard
2. Select your Spotify app (or create one)
3. Click "Edit Settings"
4. Add to **Redirect URIs**:
   ```
   https://euterpe-c0dcbd4f17ec.herokuapp.com/callback
   ```
5. Click "Save"
6. Note your **Client ID** and **Client Secret**

---

## Heroku Configuration

### Step 1: Set All Required Config Vars

Run these commands (replace values with your actual credentials):

```bash
# Spotify credentials
heroku config:set SPOTIFY_CLIENT_ID="your_spotify_client_id" --app euterpe
heroku config:set SPOTIFY_CLIENT_SECRET="your_spotify_client_secret" --app euterpe
heroku config:set SPOTIFY_REDIRECT_URI="https://euterpe-c0dcbd4f17ec.herokuapp.com/callback" --app euterpe
heroku config:set SPOTIFY_SCOPE="user-read-recently-played user-top-read user-read-private user-read-email playlist-read-private playlist-read-collaborative" --app euterpe

# Flask security
heroku config:set SECRET_KEY="<your_generated_secret_key>" --app euterpe
heroku config:set ENCRYPTION_KEY="<your_generated_encryption_key>" --app euterpe
```

**Verify all config vars are set:**
```bash
heroku config --app euterpe
```

You should see:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `SPOTIFY_SCOPE`
- `SECRET_KEY`
- `ENCRYPTION_KEY`
- `DATABASE_URL` (automatically set by Heroku Postgres)

---

## Database Initialization

### Step 2: Create the 'euterpe' Schema

**CRITICAL**: This shared database also hosts bookshelf-hermes. All Euterpe tables MUST be in the `euterpe` schema to avoid conflicts.

Run the initialization script:

```bash
heroku run python init_db.py --app euterpe
```

**Expected output:**
```
============================================================
EUTERPE DATABASE INITIALIZATION
============================================================
This script will:
1. Create 'euterpe' schema
2. Create tables in 'euterpe' schema ONLY
3. Verify no changes to 'public' schema
============================================================

Connecting to database...

Step 1: Creating 'euterpe' schema...
✓ Schema 'euterpe' created (or already exists)

Step 2: Verifying schema...
✓ Schema 'euterpe' verified

Step 3: Creating tables in 'euterpe' schema...
✓ Tables created in 'euterpe' schema

Step 4: Verifying table placement...
✓ Found 2 table(s) in 'euterpe' schema:
  - euterpe.users
  - euterpe.user_tokens

Step 5: Safety check - verifying 'public' schema integrity...
✓ No conflicting tables in 'public' schema

============================================================
DATABASE INITIALIZATION COMPLETE
============================================================
Schema: euterpe
Tables: users, user_tokens
Status: Ready for multi-user operation
============================================================
```

**If you see errors:**
- Check that DATABASE_URL is set
- Check that all dependencies are installed
- Check Heroku logs: `heroku logs --tail --app euterpe`

### Step 3: Verify Database Setup

Check the database diagnostic endpoint:

```bash
heroku run python -c "from app import app, db; app.app_context().push(); from sqlalchemy import text; conn = db.engine.connect(); result = conn.execute(text('SELECT table_name FROM information_schema.tables WHERE table_schema = \\'euterpe\\' ORDER BY table_name')); print('Tables in euterpe schema:', [row[0] for row in result.fetchall()])" --app euterpe
```

Or check via the app's diagnostic endpoint (after deployment):
```
https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check
```

---

## Deployment

### Step 4: Deploy the Application

```bash
# Ensure you're in the euterpe directory
cd /Users/alexanderspeer/Desktop/euterpe

# Add all changes
git add .

# Commit changes
git commit -m "Multi-user production deployment with schema isolation"

# Deploy to Heroku
git push heroku main
```

**Monitor deployment:**
```bash
heroku logs --tail --app euterpe
```

---

## Post-Deployment Verification

### Step 5: Test Multi-User Functionality

#### Test 1: Single User Login
1. Visit https://euterpe-c0dcbd4f17ec.herokuapp.com/
2. You should be redirected to `/login`
3. Click to authorize with Spotify
4. After authorization, you should see the dashboard
5. Check logs: `heroku logs --tail --app euterpe`
   - Should see: "User [name] ([id]) logged in successfully"

#### Test 2: Multi-User Concurrent Access
1. **Browser 1 (Normal)**: Log in with Spotify Account A
2. **Browser 2 (Incognito)**: Log in with Spotify Account B
3. Both users should see their OWN data:
   - Different top tracks
   - Different top artists
   - Different playlists
4. Verify in logs that both users are tracked separately

#### Test 3: Token Refresh
1. Log in and use the app
2. Wait for ~50 minutes (tokens expire after 1 hour)
3. Continue using the app - it should automatically refresh
4. Check logs for: "Refreshing token for user [id]"
5. No interruption in service

#### Test 4: Session Persistence
1. Log in to the app
2. Close browser completely
3. Reopen and visit the app URL
4. You should still be logged in (session cookie persists)

#### Test 5: Logout and Re-login
1. Click logout (you'll need to add a logout button to the UI)
2. Or visit: https://euterpe-c0dcbd4f17ec.herokuapp.com/logout
3. You should be redirected to login
4. Log in again - should work seamlessly

---

## Database Schema Verification

### Verify Schema Isolation

Connect to the database and verify table placement:

```bash
heroku pg:psql --app euterpe
```

Then run:
```sql
-- List all tables in euterpe schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'euterpe' 
ORDER BY table_name;

-- Should return:
--  table_name
-- -------------
--  users
--  user_tokens

-- Verify no euterpe tables in public schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'user_tokens');

-- Should return 0 rows
```

**Exit psql:**
```
\q
```

---

## Monitoring & Maintenance

### Check Application Health

```bash
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "authenticated": true,
  "user": "Your Name"
}
```

### Check Database Statistics

```bash
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check
```

Expected response:
```json
{
  "status": "ok",
  "schema": "euterpe",
  "tables": ["users", "user_tokens"],
  "users_count": 2,
  "public_safety_check": "passed"
}
```

### Monitor Logs

```bash
# Tail logs in real-time
heroku logs --tail --app euterpe

# View last 100 lines
heroku logs -n 100 --app euterpe

# Filter for errors
heroku logs --tail --app euterpe | grep ERROR
```

### Database Connection Monitoring

Check current database connections:

```bash
heroku pg:info --app euterpe
```

Important metrics:
- **Connections**: Should be well under 20 (Essential-0 limit)
- If connections are high, check for connection leaks

---

## Troubleshooting

### Issue: "ENCRYPTION_KEY environment variable not set"

**Solution:**
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
heroku config:set ENCRYPTION_KEY="<generated_key>" --app euterpe
```

### Issue: "SECRET_KEY environment variable must be set"

**Solution:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
heroku config:set SECRET_KEY="<generated_key>" --app euterpe
```

### Issue: "redirect_uri_mismatch" from Spotify

**Solution:**
1. Check Spotify dashboard Redirect URIs
2. Must include: `https://euterpe-c0dcbd4f17ec.herokuapp.com/callback`
3. Verify SPOTIFY_REDIRECT_URI config var matches exactly

### Issue: Token refresh fails

**Symptoms:** User gets logged out after ~1 hour

**Solution:**
1. Check logs for refresh errors
2. Verify SPOTIFY_CLIENT_SECRET is correct
3. Verify refresh_token is being stored encrypted

### Issue: Database connection errors

**Symptoms:** "Too many connections" or "Connection pool exhausted"

**Solution:**
1. Check connection count: `heroku pg:info --app euterpe`
2. Restart app: `heroku restart --app euterpe`
3. If persistent, reduce pool_size in app.py

### Issue: Tables created in wrong schema

**Symptoms:** Tables appear in 'public' instead of 'euterpe'

**Solution:**
1. **DO NOT** drop tables in public (bookshelf-hermes may use them)
2. Verify models.py has `__table_args__ = {'schema': 'euterpe'}`
3. Re-run init_db.py
4. Check with: `heroku pg:psql --app euterpe` then `\dt euterpe.*`

---

## Rollback Procedure

If deployment fails or causes issues:

### Option 1: Rollback Code

```bash
# View recent releases
heroku releases --app euterpe

# Rollback to previous version
heroku rollback v<previous_version_number> --app euterpe
```

### Option 2: Database Point-in-Time Recovery

```bash
# Create a backup first
heroku pg:backups:capture --app euterpe

# List available backups
heroku pg:backups --app euterpe

# Restore from backup (if needed)
heroku pg:backups:restore <backup_id> DATABASE_URL --app euterpe
```

---

## Security Checklist

- [x] All tokens encrypted at rest
- [x] SECRET_KEY set and secure
- [x] ENCRYPTION_KEY set and secure
- [x] SESSION_COOKIE_HTTPONLY enabled
- [x] SESSION_COOKIE_SECURE enabled (HTTPS only)
- [x] No plaintext credentials in code
- [x] .env and .spotify_cache in .gitignore
- [x] Database schema isolated from other apps
- [x] Connection pooling configured for resource limits

---

## Performance Optimization

### Database Connection Pooling

Current settings (in app.py):
```python
'pool_size': 5,              # 5 persistent connections
'max_overflow': 10,          # Allow 10 more if needed (total 15 max)
'pool_recycle': 300,         # Recycle after 5 minutes
'pool_pre_ping': True,       # Check connection health before use
```

**Heroku Postgres Essential-0 Limits:**
- Max connections: 20
- Current allocation: Up to 15 for app
- Leaves 5 for admin/maintenance

### Token Refresh Strategy

Tokens are refreshed:
- Automatically when within 2 minutes of expiration
- Before each Spotify API call
- Refreshed tokens stored in database immediately

### Caching Considerations

Currently, NO caching is implemented. All data is fetched fresh from Spotify.

**Future optimization:**
- Cache user data in database
- Cache API responses for X minutes
- Use Redis for session storage (upgrade from filesystem)

---

## Scaling Considerations

### Current Capacity

**Heroku Postgres Essential-0:**
- 1 GB storage
- 20 max connections
- ~700 bytes per user (user + token)
- **Theoretical capacity:** ~1.4 million users
- **Practical capacity:** Limited by connection pooling (~1000 concurrent users)

### When to Upgrade

Upgrade Heroku Postgres when:
- Approaching 800 MB storage (80% of 1 GB)
- Frequent "too many connections" errors
- Response times degrade due to database load

### Next Tier

**Heroku Postgres Standard-0 ($50/month):**
- 64 GB storage
- 120 max connections
- Daily backups with point-in-time recovery

---

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SPOTIFY_CLIENT_ID` | Yes | Spotify app client ID | `abc123...` |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify app client secret | `xyz789...` |
| `SPOTIFY_REDIRECT_URI` | Yes | OAuth callback URL | `https://euterpe-c0dcbd4f17ec.herokuapp.com/callback` |
| `SPOTIFY_SCOPE` | Yes | Spotify API scopes | `user-read-recently-played user-top-read...` |
| `SECRET_KEY` | Yes | Flask session signing key | Generated hex string |
| `ENCRYPTION_KEY` | Yes | Fernet token encryption key | Generated base64 string |
| `DATABASE_URL` | Auto | PostgreSQL connection string | Auto-set by Heroku |

---

## Commands Quick Reference

```bash
# Deploy
git push heroku main

# Initialize database
heroku run python init_db.py --app euterpe

# View logs
heroku logs --tail --app euterpe

# Check config
heroku config --app euterpe

# Set config variable
heroku config:set VAR_NAME="value" --app euterpe

# Database console
heroku pg:psql --app euterpe

# Restart app
heroku restart --app euterpe

# Check database info
heroku pg:info --app euterpe

# Create backup
heroku pg:backups:capture --app euterpe

# Run Python command
heroku run python -c "from app import app; print('Hello')" --app euterpe
```

---

## Support & Debugging

### Enable Debug Logging

For detailed troubleshooting:

```bash
heroku config:set FLASK_ENV=development --app euterpe
```

**WARNING:** Only use temporarily. Disable for production:
```bash
heroku config:unset FLASK_ENV --app euterpe
```

### Access Python Shell

```bash
heroku run python --app euterpe
```

Then:
```python
from app import app, db, User, UserToken
app.app_context().push()

# Check user count
print(f"Total users: {User.query.count()}")

# List users
for user in User.query.all():
    print(f"  {user.display_name} ({user.spotify_user_id})")
```

---

## Next Steps

1. **Add Logout Button to UI**: Update templates/index.html to include logout link
2. **Add User Profile Display**: Show current user's name in UI
3. **Error Handling**: Add better error pages for 401/403/500
4. **Rate Limiting**: Consider adding Flask-Limiter for API rate limiting
5. **Analytics**: Track user engagement, popular features
6. **Monitoring**: Set up Sentry or similar for error tracking

---

## Success Criteria

Your deployment is successful when:

- [ ] App loads at https://euterpe-c0dcbd4f17ec.herokuapp.com/
- [ ] Multiple users can log in simultaneously
- [ ] Each user sees their own Spotify data
- [ ] Tokens refresh automatically
- [ ] No "postgres://" URL errors in logs
- [ ] Database tables only in 'euterpe' schema
- [ ] No conflicts with bookshelf-hermes
- [ ] Sessions persist across browser restarts
- [ ] `/health` endpoint returns healthy status
- [ ] `/db_check` endpoint shows correct schema

---

**Deployment Date:** _________________

**Deployed By:** _________________

**Notes:** _________________

