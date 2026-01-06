# Euterpe - Deployment Commands Reference

## Quick Deploy (Owner Mode)

```bash
# 1. Generate keys
python -c "import secrets; print(secrets.token_hex(32))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 2. Set Heroku config (replace <values>)
heroku config:set \
  SPOTIFY_CLIENT_ID="<client_id>" \
  SPOTIFY_CLIENT_SECRET="<client_secret>" \
  SPOTIFY_REDIRECT_URI="https://euterpe-c0dcbd4f17ec.herokuapp.com/callback" \
  SPOTIFY_SCOPE="user-read-recently-played user-top-read user-read-private user-read-email playlist-read-private playlist-read-collaborative" \
  SECRET_KEY="<generated_key>" \
  ENCRYPTION_KEY="<generated_key>" \
  ADMIN_PASSWORD="<your_password>" \
  --app euterpe

# 3. Deploy
git add .
git commit -m "Deploy owner mode"
git push heroku main

# 4. Initialize database
heroku run python init_db.py --app euterpe

# 5. Connect your Spotify
# Visit: https://euterpe-c0dcbd4f17ec.herokuapp.com/admin
```

---

## Monitoring

```bash
# Health check
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/health

# Database check
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check

# View logs
heroku logs --tail --app euterpe

# Database info
heroku pg:info --app euterpe

# Database console
heroku pg:psql --app euterpe
```

---

## Management

```bash
# Restart app
heroku restart --app euterpe

# Check config
heroku config --app euterpe

# View releases
heroku releases --app euterpe

# Rollback
heroku rollback v<version> --app euterpe

# Run Python shell
heroku run python --app euterpe

# Create backup
heroku pg:backups:capture --app euterpe
```

---

## Database Queries

```bash
# Connect to database
heroku pg:psql --app euterpe

# Then run SQL:
\dt euterpe.*                                    # List tables in euterpe schema
SELECT * FROM euterpe.owner_tokens;              # View owner token
SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE '%token%';  # Find all token tables
\q                                               # Exit
```

---

## Troubleshooting

```bash
# Check if admin password is set
heroku config:get ADMIN_PASSWORD --app euterpe

# Check connection status
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/health | python -m json.tool

# View recent errors
heroku logs --tail --app euterpe | grep ERROR

# Test API endpoint
curl "https://euterpe-c0dcbd4f17ec.herokuapp.com/top_songs?time_range=short_term" | python -m json.tool
```

---

## Local Development

```bash
# Set local environment
export SECRET_KEY="dev-key"
export ENCRYPTION_KEY="<generated>"
export SPOTIFY_CLIENT_ID="<your_id>"
export SPOTIFY_CLIENT_SECRET="<your_secret>"
export SPOTIFY_REDIRECT_URI="http://localhost:8080/callback"
export SPOTIFY_SCOPE="user-read-recently-played user-top-read user-read-private user-read-email playlist-read-private playlist-read-collaborative"
export ADMIN_PASSWORD="admin123"

# Run locally
python app.py
# Visit: http://localhost:8080
```

---

## URLs

- **Public Dashboard:** https://euterpe-c0dcbd4f17ec.herokuapp.com/
- **Admin Panel:** https://euterpe-c0dcbd4f17ec.herokuapp.com/admin
- **Health Check:** https://euterpe-c0dcbd4f17ec.herokuapp.com/health
- **DB Check:** https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check
- **Spotify Dashboard:** https://developer.spotify.com/dashboard

---

## Emergency Procedures

### Token Expired/Invalid
```bash
# 1. Visit admin panel
open https://euterpe-c0dcbd4f17ec.herokuapp.com/admin

# 2. Reconnect Spotify account
# (Enter password, click "Reconnect Spotify Account")
```

### Database Issues
```bash
# Recreate tables (safe, idempotent)
heroku run python init_db.py --app euterpe

# Verify tables
heroku pg:psql --app euterpe -c "\dt euterpe.*"
```

### App Won't Start
```bash
# Check logs
heroku logs --tail --app euterpe

# Verify config
heroku config --app euterpe

# Restart
heroku restart --app euterpe
```

### Lost Admin Password
```bash
# Reset password
heroku config:set ADMIN_PASSWORD="new_password" --app euterpe

# Restart app
heroku restart --app euterpe
```

---

## Useful Checks

```bash
# Verify all environment variables are set
heroku config --app euterpe | grep -E "SPOTIFY|SECRET|ENCRYPTION|ADMIN|DATABASE"

# Check dyno status
heroku ps --app euterpe

# Check database connections
heroku pg:ps --app euterpe

# Check database size
heroku pg:info --app euterpe | grep Rows

# List backups
heroku pg:backups --app euterpe
```

---

## One-Liner Commands

```bash
# Full health check
echo "Health:" && curl -s https://euterpe-c0dcbd4f17ec.herokuapp.com/health && echo && echo "DB:" && curl -s https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check

# Quick deploy
git add . && git commit -m "Update" && git push heroku main

# Restart and watch logs
heroku restart --app euterpe && heroku logs --tail --app euterpe

# Check all tables in euterpe schema
heroku pg:psql --app euterpe -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'euterpe' ORDER BY table_name;"
```

---

## Python Helper Scripts

```python
# Generate new encryption key
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())

# Generate new secret key
import secrets
print(secrets.token_hex(32))

# Test token encryption locally
from encryption import encrypt_token, decrypt_token
encrypted = encrypt_token("test_token")
decrypted = decrypt_token(encrypted)
print(f"Works: {decrypted == 'test_token'}")
```

---

## Git Commands

```bash
# Check status
git status

# Add all changes
git add .

# Commit
git commit -m "Your message"

# Push to Heroku
git push heroku main

# Push to GitHub (if you have remote)
git push origin main

# View commit history
git log --oneline -10

# Revert last commit (local only)
git reset --soft HEAD~1
```

---

Save this file for quick reference during deployment and troubleshooting!

