# Heroku Deployment Analysis for Euterpe

## Executive Summary

Your Flask application currently operates as a **single-user application** with file-based token storage. To deploy on Heroku with PostgreSQL and support multiple users, significant architectural changes are required. This document outlines all necessary modifications.

---

## Current Architecture Issues

### 1. **Token Storage Problem**
- **Current**: Uses file-based cache (`.spotify_cache`) stored on local filesystem
- **Problem**: Heroku's filesystem is **ephemeral** - files are deleted on every dyno restart
- **Impact**: Users would need to re-authenticate constantly, tokens would be lost

### 2. **Single-User Design**
- **Current**: One global `auth_manager` and `spotify` client shared across all requests
- **Problem**: Multiple users would overwrite each other's tokens
- **Impact**: User A's authentication would break when User B logs in

### 3. **No Session Management**
- **Current**: No Flask sessions or user identification
- **Problem**: Cannot distinguish between different users
- **Impact**: Impossible to support multiple concurrent users

### 4. **No Database**
- **Current**: All data fetched from Spotify API on-demand, no persistence
- **Problem**: Cannot store user tokens, user preferences, or any user data
- **Impact**: Cannot support multi-user architecture

---

## Required Changes

### Phase 1: Database Setup

#### 1.1 Add Database Dependencies
Add to `requirements.txt`:
```
psycopg2-binary>=2.9.0
Flask-SQLAlchemy>=3.0.0
Flask-Session>=0.5.0
```

#### 1.2 Database Schema Design

**Users Table:**
- `id` (Primary Key, UUID or Integer)
- `spotify_user_id` (String, unique) - Spotify's user ID
- `spotify_username` (String) - Display name
- `email` (String, nullable)
- `created_at` (DateTime)
- `last_login` (DateTime)

**User Tokens Table:**
- `id` (Primary Key)
- `user_id` (Foreign Key to Users)
- `access_token` (String, encrypted) - Spotify access token
- `refresh_token` (String, encrypted) - Spotify refresh token
- `token_expires_at` (DateTime) - When access token expires
- `scope` (String) - Granted scopes
- `created_at` (DateTime)
- `updated_at` (DateTime)

**Why Separate Tables?**
- Tokens need frequent updates (refresh every hour)
- User info changes less frequently
- Better security isolation
- Easier to implement token rotation

#### 1.3 Database Models

```python
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import uuid

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    spotify_user_id = db.Column(db.String(255), unique=True, nullable=False, index=True)
    spotify_username = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to tokens
    token = db.relationship('UserToken', backref='user', uselist=False, cascade='all, delete-orphan')

class UserToken(db.Model):
    __tablename__ = 'user_tokens'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, unique=True, index=True)
    access_token = db.Column(db.Text, nullable=False)  # Store encrypted
    refresh_token = db.Column(db.Text, nullable=False)  # Store encrypted
    token_expires_at = db.Column(db.DateTime, nullable=False)
    scope = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

### Phase 2: Session Management

#### 2.1 Flask Session Configuration

```python
import os
from flask import Flask, session

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['SESSION_TYPE'] = 'filesystem'  # Or use Redis for production
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_COOKIE_SECURE'] = True  # HTTPS only
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
```

**Important**: For production, consider using Redis-backed sessions:
```python
app.config['SESSION_TYPE'] = 'redis'
app.config['SESSION_REDIS'] = redis.from_url(os.environ.get('REDIS_URL'))
```

#### 2.2 User Session Flow

1. User visits `/` → Check `session.get('user_id')`
2. If no session → Redirect to `/auth`
3. After OAuth callback → Store `user_id` in session
4. All subsequent requests use `session['user_id']` to fetch user-specific tokens

---

### Phase 3: OAuth Flow Refactoring

#### 3.1 Per-Request Auth Manager

**Current Problem:**
```python
# Global auth_manager - WRONG for multi-user
auth_manager = SpotifyOAuth(...)
sp = spotipy.Spotify(auth_manager=auth_manager)
```

**Solution:**
Create auth manager per request based on user session:

```python
def get_auth_manager_for_user(user_id=None):
    """Get or create SpotifyOAuth manager for a specific user"""
    if not user_id:
        user_id = session.get('user_id')
    
    if not user_id:
        return None
    
    # Create auth manager without cache_path (we'll use database)
    return SpotifyOAuth(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        scope=SCOPE,
        cache_path=None,  # Don't use file cache
        open_browser=False
    )

def get_spotify_client_for_user(user_id=None):
    """Get authenticated Spotify client for current user"""
    if not user_id:
        user_id = session.get('user_id')
    
    if not user_id:
        return None
    
    # Get user from database
    user = User.query.filter_by(id=user_id).first()
    if not user or not user.token:
        return None
    
    # Check if token is expired
    if user.token.token_expires_at < datetime.utcnow():
        # Refresh token
        refresh_user_token(user)
        user = User.query.filter_by(id=user_id).first()  # Reload
    
    # Create auth manager with token from database
    auth_manager = get_auth_manager_for_user(user_id)
    auth_manager.token_info = {
        'access_token': decrypt_token(user.token.access_token),
        'refresh_token': decrypt_token(user.token.refresh_token),
        'expires_at': int(user.token.token_expires_at.timestamp()),
        'scope': user.token.scope
    }
    
    return spotipy.Spotify(auth_manager=auth_manager)
```

#### 3.2 Token Storage in Database

**On OAuth Callback:**
```python
@app.route('/callback')
def callback():
    code = request.args.get('code')
    if not code:
        return redirect(url_for('auth'))
    
    # Exchange code for token
    auth_manager = get_auth_manager_for_user()
    token_info = auth_manager.get_access_token(code, as_dict=True)
    
    # Get user info from Spotify
    temp_sp = spotipy.Spotify(auth_manager=auth_manager)
    spotify_user = temp_sp.current_user()
    
    # Find or create user
    user = User.query.filter_by(spotify_user_id=spotify_user['id']).first()
    if not user:
        user = User(
            spotify_user_id=spotify_user['id'],
            spotify_username=spotify_user['display_name'],
            email=spotify_user.get('email')
        )
        db.session.add(user)
        db.session.commit()
    
    # Store or update token
    expires_at = datetime.utcnow() + timedelta(seconds=token_info['expires_in'])
    
    if user.token:
        # Update existing token
        user.token.access_token = encrypt_token(token_info['access_token'])
        user.token.refresh_token = encrypt_token(token_info['refresh_token'])
        user.token.token_expires_at = expires_at
        user.token.scope = token_info.get('scope', '')
        user.token.updated_at = datetime.utcnow()
    else:
        # Create new token
        user_token = UserToken(
            user_id=user.id,
            access_token=encrypt_token(token_info['access_token']),
            refresh_token=encrypt_token(token_info['refresh_token']),
            token_expires_at=expires_at,
            scope=token_info.get('scope', '')
        )
        db.session.add(user_token)
    
    user.last_login = datetime.utcnow()
    db.session.commit()
    
    # Set session
    session['user_id'] = user.id
    session.permanent = True
    
    return redirect(url_for('index'))
```

#### 3.3 Token Refresh Logic

```python
def refresh_user_token(user):
    """Refresh a user's expired Spotify token"""
    if not user.token:
        return False
    
    auth_manager = get_auth_manager_for_user(user.id)
    auth_manager.token_info = {
        'refresh_token': decrypt_token(user.token.refresh_token)
    }
    
    try:
        new_token_info = auth_manager.refresh_access_token(
            decrypt_token(user.token.refresh_token)
        )
        
        expires_at = datetime.utcnow() + timedelta(seconds=new_token_info['expires_in'])
        
        user.token.access_token = encrypt_token(new_token_info['access_token'])
        user.token.token_expires_at = expires_at
        user.token.updated_at = datetime.utcnow()
        
        # Update refresh token if provided
        if 'refresh_token' in new_token_info:
            user.token.refresh_token = encrypt_token(new_token_info['refresh_token'])
        
        db.session.commit()
        return True
    except Exception as e:
        print(f"Error refreshing token for user {user.id}: {e}")
        return False
```

---

### Phase 4: Security Considerations

#### 4.1 Token Encryption

**NEVER store tokens in plain text!**

```python
from cryptography.fernet import Fernet
import base64

def get_encryption_key():
    """Get encryption key from environment"""
    key = os.environ.get('ENCRYPTION_KEY')
    if not key:
        raise ValueError("ENCRYPTION_KEY environment variable not set")
    return base64.urlsafe_b64decode(key.encode())

def encrypt_token(token):
    """Encrypt a token before storing"""
    f = Fernet(get_encryption_key())
    return f.encrypt(token.encode()).decode()

def decrypt_token(encrypted_token):
    """Decrypt a stored token"""
    f = Fernet(get_encryption_key())
    return f.decrypt(encrypted_token.encode()).decode()
```

**Generate encryption key:**
```python
from cryptography.fernet import Fernet
key = Fernet.generate_key()
print(key.decode())  # Add this to Heroku config vars
```

#### 4.2 Environment Variables for Heroku

Required Heroku Config Vars:
```
CLIENT_ID=your_spotify_client_id
CLIENT_SECRET=your_spotify_client_secret
REDIRECT_URI=https://your-app.herokuapp.com/callback
SCOPE=user-read-recently-played user-top-read user-read-private user-read-email playlist-read-private
SECRET_KEY=your-flask-secret-key
ENCRYPTION_KEY=your-encryption-key-base64
DATABASE_URL=automatically-set-by-heroku-postgres
```

---

### Phase 5: Heroku-Specific Configuration

#### 5.1 Procfile

Create `Procfile` in root:
```
web: gunicorn app:app
```

#### 5.2 Runtime Configuration

Create `runtime.txt`:
```
python-3.11.0
```
(Or your preferred Python version)

#### 5.3 Database Connection

```python
import os
from urllib.parse import urlparse

# Get database URL from Heroku
DATABASE_URL = os.environ.get('DATABASE_URL')

if DATABASE_URL:
    # Heroku provides postgres:// but SQLAlchemy needs postgresql://
    if DATABASE_URL.startswith('postgres://'):
        DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
    
    app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
else:
    # Local development
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///euterpe.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_pre_ping': True,  # Verify connections before using
    'pool_recycle': 300,     # Recycle connections after 5 minutes
}
```

#### 5.4 Database Initialization

```python
@app.before_first_request
def create_tables():
    db.create_all()
```

Or use Flask-Migrate for better migration management:
```python
from flask_migrate import Migrate

migrate = Migrate(app, db)
```

---

### Phase 6: Updated Route Handlers

#### 6.1 Index Route

```python
@app.route('/')
def index():
    """Render the main dashboard page."""
    user_id = session.get('user_id')
    if not user_id:
        return redirect(url_for('auth'))
    
    user = User.query.filter_by(id=user_id).first()
    if not user or not user.token:
        session.clear()
        return redirect(url_for('auth'))
    
    return render_template('index.html', username=user.spotify_username)
```

#### 6.2 API Routes

All API routes need to be user-aware:

```python
@app.route('/top_albums', methods=['GET'])
def top_albums():
    """Fetch top albums for the current user"""
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    
    client = get_spotify_client_for_user(user_id)
    if not client:
        return jsonify({'error': 'Authentication expired. Please re-authenticate.'}), 401
    
    time_range = request.args.get('time_range', 'medium_term')
    data = get_top_albums(client, time_range)
    return jsonify(data)
```

**Apply this pattern to ALL routes:**
- `/top_songs`
- `/top_artists`
- `/top_playlists`
- `/hidden_gems`
- `/artists_standing_test_of_time`
- `/artists_falling_off`
- `/release_year_trends`
- `/music_variety_by_season`

---

### Phase 7: Logout Functionality

```python
@app.route('/logout')
def logout():
    """Log out the current user"""
    session.clear()
    return redirect(url_for('auth'))
```

---

## Database Migration Strategy

### Option 1: Manual Migration (Simple)
1. Create database models
2. Run `db.create_all()` on first deploy
3. Heroku Postgres will be empty initially

### Option 2: Flask-Migrate (Recommended)
1. Install Flask-Migrate
2. Initialize migrations: `flask db init`
3. Create initial migration: `flask db migrate -m "Initial migration"`
4. Apply: `flask db upgrade`

---

## Testing Checklist

Before deploying to Heroku:

- [ ] Database models created and tested locally
- [ ] Token encryption/decryption working
- [ ] OAuth flow works with database storage
- [ ] Multiple users can authenticate simultaneously
- [ ] Token refresh works correctly
- [ ] Session management prevents token mixing
- [ ] All API routes are user-aware
- [ ] Logout clears session properly
- [ ] Database connection pooling configured
- [ ] Error handling for expired tokens
- [ ] Error handling for database connection failures

---

## Deployment Steps

1. **Create Heroku App:**
   ```bash
   heroku create your-app-name
   ```

2. **Add PostgreSQL:**
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```

3. **Set Environment Variables:**
   ```bash
   heroku config:set CLIENT_ID=your_id
   heroku config:set CLIENT_SECRET=your_secret
   heroku config:set REDIRECT_URI=https://your-app.herokuapp.com/callback
   heroku config:set SCOPE=user-read-recently-played user-top-read user-read-private user-read-email playlist-read-private
   heroku config:set SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
   heroku config:set ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
   ```

4. **Update Spotify Dashboard:**
   - Add `https://your-app.herokuapp.com/callback` to Redirect URIs

5. **Deploy:**
   ```bash
   git push heroku main
   ```

6. **Initialize Database:**
   ```bash
   heroku run python
   >>> from app import app, db
   >>> app.app_context().push()
   >>> db.create_all()
   >>> exit()
   ```

---

## Performance Considerations

### Database Connection Pooling
- Heroku Postgres Essential-0: 20 connections max
- Configure SQLAlchemy pool size accordingly:
  ```python
  app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
      'pool_size': 5,
      'max_overflow': 10,
      'pool_pre_ping': True,
      'pool_recycle': 300,
  }
  ```

### Token Refresh Strategy
- Check token expiration before each API call
- Refresh proactively (5 minutes before expiry)
- Cache refreshed tokens in memory (with session) to avoid DB hits

### Query Optimization
- Add indexes on `user_id` and `spotify_user_id`
- Use `lazy='joined'` for token relationship to avoid N+1 queries

---

## Security Best Practices

1. **HTTPS Only**: All cookies and tokens transmitted over HTTPS
2. **Token Encryption**: All tokens encrypted at rest
3. **Session Security**: Secure, HttpOnly cookies
4. **SQL Injection**: Use SQLAlchemy ORM (parameterized queries)
5. **XSS Protection**: Flask auto-escapes templates
6. **CSRF Protection**: Consider Flask-WTF for forms
7. **Rate Limiting**: Consider Flask-Limiter for API endpoints

---

## Monitoring & Logging

### Heroku Logs
```bash
heroku logs --tail
```

### Database Monitoring
- Use Heroku Postgres metrics dashboard
- Monitor connection pool usage
- Set up alerts for connection exhaustion

### Error Tracking
Consider adding Sentry or similar:
```python
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

sentry_sdk.init(
    dsn=os.environ.get('SENTRY_DSN'),
    integrations=[FlaskIntegration()],
    traces_sample_rate=1.0
)
```

---

## Cost Considerations

### Heroku Postgres Essential-0
- **Price**: $5/month
- **Storage**: 1 GB
- **Connections**: 20 max
- **Backups**: Daily (7-day retention)

### Estimated Storage per User
- User record: ~200 bytes
- Token record: ~500 bytes (encrypted)
- **Total per user**: ~700 bytes

**Capacity**: ~1.4 million users per GB (theoretical, but connection limits will be hit first)

---

## Rollback Plan

If issues occur:

1. **Database Rollback**: Use Heroku Postgres point-in-time recovery
2. **Code Rollback**: `git revert` and redeploy
3. **Config Rollback**: Revert environment variables via Heroku dashboard

---

## Next Steps

1. Review this analysis
2. Create database models
3. Implement session management
4. Refactor OAuth flow
5. Update all routes
6. Test locally with PostgreSQL
7. Deploy to Heroku staging
8. Test with multiple users
9. Deploy to production

---

## Questions to Consider

1. **User Data Retention**: How long to keep user data after inactivity?
2. **Token Rotation**: Implement automatic token rotation?
3. **Analytics**: Track user usage patterns?
4. **Rate Limiting**: Per-user or global limits?
5. **Caching**: Cache Spotify API responses to reduce calls?
6. **Background Jobs**: Use Celery for token refresh in background?

---

This analysis provides a comprehensive roadmap for deploying your application to Heroku with proper multi-user support and database integration.

