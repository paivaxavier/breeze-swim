# Breeze Swim

Website for **Breeze Swim** — private aquatic survival lessons in Flagler County, FL. Lessons for ages 6 months and up, all abilities welcome.

## Pages

| Page | File |
|------|------|
| Home | `index.html` |
| Lessons | `lessons.html` |
| About | `about.html` |
| FAQ | `faq.html` |
| Contact | `contact.html` |

## Client portal

Parents and Brielle use the **client portal** for onboarding and lesson info.

```bash
cd portal
cp .env.example .env.local   # add Supabase keys
npm install
npm run dev
```

See **[PORTAL.md](PORTAL.md)** for full setup (Supabase migrations, admin access, invite flow).

## Local preview

Open any `.html` file in a browser, or run a simple server:

```bash
cd ~/breeze-swim
python3 -m http.server 8080
```

Then visit http://localhost:8080

## Adding lesson videos

Videos live in the `videos/` folder — you don't add them through Cursor.

1. **AirDrop** clips from iPhone to your Mac (Downloads is fine)
2. Copy into `~/breeze-swim/videos/` via **Finder** or Terminal:

```bash
cp ~/Downloads/YourVideo.MOV ~/breeze-swim/videos/clip-1.mov
```

3. Make sure `js/site-config.js` points to each file:

```javascript
src: 'videos/clip-1.mov',
```

Use `.mp4` for web playback (`.mov` from iPhone often won't play in Chrome). Convert with:

```bash
avconvert --source clip-1.mov --preset Preset1280x720 --output clip-1.mp4 --replace
```

The homepage video section hides automatically if no files are set.

## GitHub (separate from XP Detailing)

This repo is independent of `paivaxavier/default`. To publish:

1. Create a new repo on GitHub: `breeze-swim` (or `breeze-swim-website`)
2. Connect and push:

```bash
git remote add origin https://github.com/paivaxavier/breeze-swim.git
git add .
git commit -m "Initial Breeze Swim website scaffold."
git push -u origin main
```

## Open in Cursor

**File → Open Folder** → `~/breeze-swim`

Use a separate Cursor window from the XP Detailing project.
