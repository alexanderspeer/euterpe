# Euterpe Architecture - Multi-User Production System

## System Overview

Euterpe is now a **production-ready, multi-user Spotify analytics dashboard** deployed on Heroku with PostgreSQL-backed authentication and strict schema isolation.

---

## Key Architectural Changes

### Before (Single-User, Local)
```
User → Flask App → .spotify_cache (file) → Spotify API
                └─ Global auth_manager (shared)
```

**Problems:**
- File cache lost on Heroku dyno restart
- Single global auth manager - users overwrite each other's tokens
- No user identification or session management
- No data persistence

### After (Multi-User, Production)
```
User A → Flask Session A → PostgreSQL (euterpe.user_tokens) → Spotify API
User B → Flask Session B → PostgreSQL (euterpe.user_tokens) → Spotify API
         ↓
    Per-request auth manager (stateless)
    ↓
    Encrypted token storage
    ↓
    Automatic token refresh
```

**Benefits:**
- Tokens persist across dyno restarts
- Each user has isolated session and tokens
- Per-request Spotify client creation
- Automatic token refresh before expiration
- Full multi-user concurrent access

---

## Database Architecture

### Schema Isolation Strategy

**Critical Requirement:** Shared database with bookshelf-hermes

```
PostgreSQL Database
├── public schema (bookshelf-hermes tables)
│   ├── books
│   ├── authors
│   └── ... (other bookshelf tables)
│
└── euterpe schema (euterpe tables ONLY)
    ├── users
    └── user_tokens
```

**How Isolation Works:**
1. All Euterpe models use `__table_args__ = {'schema': 'euterpe'}`
2. Foreign keys are schema-qualified: `euterpe.users.id`
3. SQLAlchemy creates tables only in euterpe schema
4. No CREATE/ALTER/DROP operations on public schema
5. Both apps coexist safely on same database

### Table Schema

**euterpe.users**
```sql
CREATE TABLE euterpe.users (
    id VARCHAR(36) PRIMARY KEY,
    spotify_user_id VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_users_spotify_user_id ON euterpe.users(spotify_user_id);
```

**euterpe.user_tokens**
```sql
CREATE TABLE euterpe.user_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) UNIQUE NOT NULL REFERENCES euterpe.users(id),
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    scope TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_user_tokens_user_id ON euterpe.user_tokens(user_id);
```

---

## Authentication Flow

### 1. Login Flow

```
User visits /
    ↓
No session? → Redirect to /login
    ↓
GET /login → Redirect to Spotify OAuth
    ↓
User authorizes on Spotify
    ↓
Spotify redirects to /callback?code=xxx
    ↓
Exchange code for tokens
    ↓
Get user profile from Spotify /me
    ↓
Upsert user in database (euterpe.users)
    ↓
Encrypt and store tokens (euterpe.user_tokens)
    ↓
Set session['user_id'] = user.id
    ↓
Redirect to dashboard
```

### 2. Authenticated Request Flow

```
User makes request (e.g., GET /top_songs)
    ↓
Read session['user_id']
    ↓
Query database: User.query.filter_by(id=user_id)
    ↓
Check token expiration
    ↓
If expired/expiring → Refresh token
    ↓
Decrypt access_token
    ↓
Create Spotify client with token
    ↓
Call Spotify API
    ↓
Return data to user
```

### 3. Token Refresh Flow

```
Check: token.expires_at < now + 2 minutes?
    ↓
If yes:
    Decrypt refresh_token
        ↓
    Call Spotify token refresh endpoint
        ↓
    Get new access_token (and possibly new refresh_token)
        ↓
    Encrypt new tokens
        ↓
    Update database (euterpe.user_tokens)
        ↓
    Return success
```

---

## Security Architecture

### Token Encryption

**Algorithm:** Fernet (symmetric encryption)
- AES-128 in CBC mode
- HMAC for authentication
- Key derived from ENCRYPTION_KEY environment variable

**Process:**
```python
# Storage
plaintext_token → Fernet.encrypt() → encrypted_token → Database

# Retrieval
Database → encrypted_token → Fernet.decrypt() → plaintext_token → Use
```

**Why Encryption?**
- Tokens are credentials - treat like passwords
- Database breach doesn't expose active tokens
- Compliance with security best practices
- Defense in depth

### Session Security

**Configuration:**
```python
SESSION_COOKIE_HTTPONLY = True   # Prevent XSS access to cookies
SESSION_COOKIE_SECURE = True     # HTTPS only (production)
SESSION_COOKIE_SAMESITE = 'Lax'  # CSRF protection
SECRET_KEY = <strong random key>  # Cookie signing/encryption
```

**Session Data:**
- Only `user_id` stored in session
- No tokens in session (too large, security risk)
- Session signed to prevent tampering
- Session expires when browser closes (non-permanent)

---

## Connection Pooling

**Heroku Postgres Essential-0 Limits:**
- 20 max connections total

**SQLAlchemy Configuration:**
```python
pool_size = 5              # 5 persistent connections
max_overflow = 10          # Allow 10 more if needed
                          # Total: 15 max for app
pool_recycle = 300         # Recycle every 5 minutes
pool_pre_ping = True       # Health check before use
```

**Why Conservative Pooling?**
- Shared database with bookshelf-hermes
- Leave headroom for admin operations
- Prevent connection exhaustion
- Heroku kills apps that exceed limits

---

## API Request Path

Example: User requests top tracks

```
1. HTTP GET /top_songs?time_range=short_term
   ↓
2. Check session['user_id'] → Found? Continue : 401
   ↓
3. get_spotify_client_for_current_user()
   ├─ Query: User.query.filter_by(id=user_id)
   ├─ Check token expiry
   ├─ Refresh if needed (2-minute buffer)
   ├─ Decrypt access_token
   └─ Return Spotify client
   ↓
4. get_top_songs(client, time_range='short_term')
   ├─ client.current_user_top_tracks(limit=50, time_range='short_term')
   ├─ Process results
   └─ Return formatted data
   ↓
5. jsonify(data) → Return to client
```

**Performance:**
- Database query: ~5-10ms
- Token decryption: <1ms
- Spotify API call: 200-500ms (dominant)
- Total: ~250-550ms per request

---

## Error Handling

### Token Errors

**Expired Token:**
- Automatically refreshed before API calls
- If refresh fails → Session cleared, redirect to /login
- User sees: "Please log in again"

**Invalid Token:**
- Database entry deleted
- Session cleared
- User redirected to /login

**Refresh Token Revoked:**
- User must re-authorize
- Old tokens deleted from database

### Database Errors

**Connection Failure:**
- SQLAlchemy auto-retry with pool_pre_ping
- If persistent → 500 error, logged

**Schema Not Found:**
- init_db.py creates schema automatically
- Safe to run multiple times

**Table Not Found:**
- Run init_db.py to create tables
- Diagnostic endpoint /db_check helps debug

---

## Deployment Architecture

### Heroku Components

```
Internet
    ↓
Heroku Router
    ↓
[Dynos: Web processes running gunicorn]
    ↓
Heroku Postgres (Essential-0)
    ├── public schema (bookshelf-hermes)
    └── euterpe schema (euterpe)
```

**Dyno Configuration:**
- Type: Web
- Process: `gunicorn app:app`
- Language: Python 3.11.9
- Auto-restart on crash
- Ephemeral filesystem (nothing persists)

**Scaling:**
- Current: 1 dyno (free/hobby tier)
- Can scale to multiple dynos
- Database handles concurrent connections
- Stateless design (no shared memory)

---

## File Structure

```
euterpe/
├── app.py                    # Main Flask application (multi-user)
├── models.py                 # SQLAlchemy models (euterpe schema)
├── encryption.py             # Token encryption utilities
├── logic.py                  # Spotify analytics functions (unchanged)
├── init_db.py               # Database initialization script
├── requirements.txt          # Python dependencies
├── Procfile                  # Heroku process definition
├── runtime.txt               # Python version
├── .gitignore                # Excludes .spotify_cache
├── templates/
│   └── index.html           # Dashboard UI (mostly unchanged)
├── static/                   # CSS/JS/images (unchanged)
└── docs/
    ├── DEPLOYMENT_GUIDE.md   # Comprehensive deployment guide
    ├── QUICK_START.md        # Fast-track deployment
    └── ARCHITECTURE.md       # This file
```

**Removed:**
- `.spotify_cache` (file-based token cache)
- Global `auth_manager` variable
- Global `sp` (Spotify client) variable

---

## Testing Strategy

### Local Development

```bash
# Set environment variables
export SECRET_KEY="dev-secret-key"
export ENCRYPTION_KEY="<generated-key>"
export SPOTIFY_CLIENT_ID="<your-id>"
export SPOTIFY_CLIENT_SECRET="<your-secret>"
export SPOTIFY_REDIRECT_URI="http://localhost:8080/callback"
export SPOTIFY_SCOPE="user-read-recently-played user-top-read..."

# Run locally
python app.py
```

**Local Database:**
- SQLite fallback: `euterpe_local.db`
- Same schema structure
- For testing only

### Production Testing

**Multi-User Test:**
1. Browser 1: Log in as User A
2. Browser 2 (Incognito): Log in as User B
3. Verify both see different data
4. Check logs: Both users tracked separately

**Token Refresh Test:**
1. Log in and use app
2. Wait ~58 minutes
3. Make another request
4. Check logs for "Refreshing token for user"
5. Verify no interruption

**Schema Isolation Test:**
```sql
-- Connect to database
heroku pg:psql --app euterpe

-- Verify tables in correct schema
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_name IN ('users', 'user_tokens')
ORDER BY table_schema, table_name;

-- Should show:
--  table_schema | table_name
-- --------------+-------------
--  euterpe      | users
--  euterpe      | user_tokens
```

---

## Monitoring & Observability

### Application Metrics

```bash
# Health check
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/health

# Database diagnostics
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check

# User count
heroku run python -c "from app import app, db, User; app.app_context().push(); print(f'Users: {User.query.count()}')" --app euterpe
```

### Database Metrics

```bash
# Connection info
heroku pg:info --app euterpe

# Connection count
heroku pg:ps --app euterpe

# Slow queries (if needed)
heroku pg:diagnose --app euterpe
```

### Logs

```bash
# Real-time logs
heroku logs --tail --app euterpe

# Filter for errors
heroku logs --tail --app euterpe | grep ERROR

# Filter for token refreshes
heroku logs --tail --app euterpe | grep "Refreshing token"

# Filter for user logins
heroku logs --tail --app euterpe | grep "logged in successfully"
```

---

## Future Enhancements

### Short Term
- [ ] Add logout button to UI
- [ ] Display current user name in navbar
- [ ] Better error pages (401, 403, 500)
- [ ] Loading indicators for API calls

### Medium Term
- [ ] Cache Spotify API responses (reduce API calls)
- [ ] User preferences (favorite time range, etc.)
- [ ] Export data to CSV/JSON
- [ ] Share analytics with friends (public URLs)

### Long Term
- [ ] Historical tracking (store analytics snapshots)
- [ ] Trend analysis over time
- [ ] Collaborative playlists based on common tastes
- [ ] Social features (compare with friends)
- [ ] Mobile app (React Native)

---

## Maintenance

### Regular Tasks

**Weekly:**
- Check Heroku logs for errors
- Monitor database size: `heroku pg:info`
- Verify no connection pool exhaustion

**Monthly:**
- Review user count growth
- Check for slow queries
- Update dependencies (security patches)

**Quarterly:**
- Review and optimize database queries
- Analyze token refresh patterns
- Consider caching strategy

### Backup Strategy

**Automatic Backups:**
- Heroku Postgres Essential-0: Daily backups
- 7-day retention
- Automatic on backup schedule

**Manual Backup:**
```bash
heroku pg:backups:capture --app euterpe
```

**Restore from Backup:**
```bash
heroku pg:backups:restore <backup-id> DATABASE_URL --app euterpe
```

---

## Security Considerations

### Threat Model

**Threats Mitigated:**
- ✅ Token theft from database (encryption at rest)
- ✅ Session hijacking (secure cookies, HTTPS only)
- ✅ XSS attacks on tokens (HttpOnly cookies, no tokens in JS)
- ✅ SQL injection (SQLAlchemy ORM with parameters)
- ✅ Schema interference (strict schema isolation)

**Residual Risks:**
- ⚠️ ENCRYPTION_KEY compromise (rotate key if exposed)
- ⚠️ Spotify API rate limits (per-user rate limiting needed)
- ⚠️ Database full-table scan (add query limits)

### Security Audit Checklist

- [x] All tokens encrypted at rest
- [x] No plaintext credentials in code
- [x] Secure session cookies (HttpOnly, Secure, SameSite)
- [x] Environment variables for secrets
- [x] HTTPS enforced (Heroku automatic)
- [x] No SQL injection vectors (ORM only)
- [x] No XSS in templates (Flask auto-escape)
- [x] Schema isolation from other apps
- [x] Token refresh secured
- [x] Error messages don't leak sensitive info

---

## Conclusion

Euterpe is now a **production-ready, multi-user system** with:
- ✅ Full PostgreSQL-backed authentication
- ✅ Strict schema isolation (safe shared database)
- ✅ Encrypted token storage
- ✅ Automatic token refresh
- ✅ Concurrent multi-user support
- ✅ Heroku-optimized deployment
- ✅ Comprehensive monitoring and diagnostics

**Ready to scale** from prototype to production.

