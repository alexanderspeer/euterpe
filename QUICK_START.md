# Euterpe - Quick Start (Owner Mode)

## 🚀 Deploy Your Public Spotify Dashboard

Euterpe displays YOUR Spotify data publicly. Visitors browse without logging in.

---

## 1. Generate Secrets

```bash
# Generate SECRET_KEY
python -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"

# Generate ENCRYPTION_KEY
python -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())"
```

**SAVE THESE VALUES!**

---

## 2. Configure Spotify App

1. Go to https://developer.spotify.com/dashboard
2. Edit your Spotify app settings
3. Add Redirect URI: `https://euterpe-c0dcbd4f17ec.herokuapp.com/callback`
4. Save changes

---

## 3. Set Heroku Config Vars

```bash
# Replace <values> with your actual values
heroku config:set \
  SPOTIFY_CLIENT_ID="<your_client_id>" \
  SPOTIFY_CLIENT_SECRET="<your_client_secret>" \
  SPOTIFY_REDIRECT_URI="https://euterpe-c0dcbd4f17ec.herokuapp.com/callback" \
  SPOTIFY_SCOPE="user-read-recently-played user-top-read user-read-private user-read-email playlist-read-private playlist-read-collaborative" \
  SECRET_KEY="<generated_secret_key>" \
  ENCRYPTION_KEY="<generated_encryption_key>" \
  ADMIN_PASSWORD="<your_admin_password>" \
  --app euterpe
```

---

## 4. Deploy

```bash
cd /Users/alexanderspeer/Desktop/euterpe
git add .
git commit -m "Deploy owner mode"
git push heroku main
```

---

## 5. Initialize Database

```bash
heroku run python init_db.py --app euterpe
```

**Expected:** ✓ Schema 'euterpe' created, ✓ Tables created (including owner_tokens)

---

## 6. Connect Your Spotify Account

1. Visit: https://euterpe-c0dcbd4f17ec.herokuapp.com/admin
2. Enter your `ADMIN_PASSWORD`
3. Click "Connect Spotify Account"
4. Authorize on Spotify
5. Done! Your data is now public

---

## ✅ Success Checklist

- [ ] All config vars set (including `ADMIN_PASSWORD`)
- [ ] Spotify redirect URI configured
- [ ] App deployed successfully
- [ ] Database initialized (euterpe schema + owner_tokens table)
- [ ] Connected via `/admin`
- [ ] Public site loads without login prompt

---

## 🌐 Test Public Access

**Share this URL:** https://euterpe-c0dcbd4f17ec.herokuapp.com/

Anyone can view YOUR Spotify data without logging in!

---

## 🔒 Admin Access (You Only)

**Admin Panel:** https://euterpe-c0dcbd4f17ec.herokuapp.com/admin
**Password:** Your `ADMIN_PASSWORD`

From admin panel you can:
- View connection status
- Reconnect Spotify account
- Check token expiration

---

## 🔍 Verify

```bash
# Check health (should show connected: true)
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/health

# Check database (should show owner_connected: true)
curl https://euterpe-c0dcbd4f17ec.herokuapp.com/db_check

# View logs
heroku logs --tail --app euterpe
```

---

## 🐛 Common Issues

**"Site not connected to Spotify"**
→ Go to `/admin`, enter password, click "Connect Spotify Account"

**"Invalid admin password"**
→ Check: `heroku config:get ADMIN_PASSWORD --app euterpe`

**"OwnerToken table not found"**
→ Run: `heroku run python init_db.py --app euterpe`

---

## 📚 Need More Help?

See `OWNER_MODE.md` for comprehensive instructions.

---

## 🎉 You're Done!

**Public URL:** https://euterpe-c0dcbd4f17ec.herokuapp.com/
**Admin URL:** https://euterpe-c0dcbd4f17ec.herokuapp.com/admin

Your Spotify analytics dashboard is live and public!
