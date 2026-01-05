# Euterpe - Quick Start Deployment

## 🚀 Fast Track to Production

### 1. Generate Secrets

```bash
# Generate SECRET_KEY
python -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"

# Generate ENCRYPTION_KEY
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"
```

**SAVE THESE VALUES!**

---

### 2. Configure Spotify App

1. Go to https://developer.spotify.com/dashboard
2. Edit your Spotify app settings
3. Add Redirect URI: `https://euterpe-c0dcbd4f17ec.herokuapp.com/callback`
4. Save changes

---

### 3. Set Heroku Config Vars

```bash
# Replace <values> with your actual values
heroku config:set \
  SPOTIFY_CLIENT_ID="<your_client_id>" \
  SPOTIFY_CLIENT_SECRET="<your_client_secret>" \
  SPOTIFY_REDIRECT_URI="https://euterpe-c0dcbd4f17ec.herokuapp.com/callback" \
  SPOTIFY_SCOPE="user-read-recently-played user-top-read user-read-private user-read-email playlist-read-private playlist-read-collaborative" \
  SECRET_KEY="<generated_secret_key>" \
  ENCRYPTION_KEY="<generated_encryption_key>" \
  --app euterpe
```

---

### 4. Deploy

```bash
cd /Users/alexanderspeer/Desktop/euterpe
git add .
git commit -m "Multi-user production deployment"
git push heroku main
```

---

### 5. Initialize Database

```bash
heroku run python init_db.py --app euterpe
```

**Expected:** ✓ Schema 'euterpe' created, tables created in euterpe schema

---

### 6. Verify

```bash
# Check app health
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/health

# Check database
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check

# View logs
heroku logs --tail --app euterpe
```

---

## ✅ Success Checklist

- [ ] All config vars set (run `heroku config --app euterpe`)
- [ ] Spotify redirect URI configured
- [ ] App deployed successfully
- [ ] Database initialized (euterpe schema created)
- [ ] Can log in with Spotify
- [ ] Dashboard loads with your data
- [ ] No errors in logs

---

## 🔍 Test Multi-User

1. **Normal browser:** Log in with Spotify Account A
2. **Incognito browser:** Log in with Spotify Account B
3. Both should see DIFFERENT data (their own Spotify stats)

---

## 🐛 Common Issues

**"ENCRYPTION_KEY not set"**
→ Run step 1 again, set config var

**"redirect_uri_mismatch"**
→ Check Spotify dashboard, ensure exact URL match

**"Tables not found"**
→ Run `heroku run python init_db.py --app euterpe` again

**App crashes on startup**
→ Check logs: `heroku logs --tail --app euterpe`

---

## 📚 Need More Help?

See `DEPLOYMENT_GUIDE.md` for comprehensive instructions.

---

## 🎉 You're Done!

Visit: https://euterpe-c0dcbd4f17ec.herokuapp.com/

Your multi-user Spotify analytics dashboard is live!

