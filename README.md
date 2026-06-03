# 🐾 Vet Dosage Tracker

Veterinary medication calculator and treatment log. Built with React + Vite, backed by Supabase.

---

## Deploy Today (4 steps)

### Step 1 — Set up Supabase database

1. Go to [supabase.com](https://supabase.com) and open your project
2. Click **SQL Editor** in the left sidebar
3. Paste the entire contents of `supabase-schema.sql` and click **Run**
4. You should see the `medications` and `treatments` tables appear under Table Editor

### Step 2 — Install and test locally (optional but recommended)

```bash
cd vet-tracker
npm install
npm run dev
```

Open http://localhost:5173 — the app should show "🟢 Supabase" in the header.

### Step 3 — Deploy to Vercel

**Option A: Drag & Drop (easiest)**
1. Run `npm run build` — this creates a `dist/` folder
2. Go to [vercel.com](https://vercel.com) and sign up (free)
3. Click **Add New → Project**
4. Drag the entire `vet-tracker` folder onto the page
5. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = `https://rvvrxpjwrfijxnholdos.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your anon key from Supabase Settings → API
6. Click **Deploy**

**Option B: GitHub (best for ongoing updates)**
1. Push this folder to a GitHub repo
2. Connect the repo in Vercel
3. Add the same environment variables
4. Every `git push` auto-deploys

### Step 4 — Done

You'll get a URL like `https://vet-tracker-xyz.vercel.app`. Bookmark it on your phone.

---

## Migrating from localStorage to Supabase

If you used the app before setting up Supabase:

1. Go to the **📦 Data** tab
2. Click **Export as JSON** — saves a backup file
3. Set up Supabase (steps above) and redeploy
4. Go to **📦 Data** tab again, click **Import JSON Backup**
5. All your treatments and custom medications will upload to Supabase

---

## Adding Authentication (Phase 2)

Right now the app is open to anyone with the URL. To add login:

1. Enable **Email Auth** in Supabase → Authentication → Providers
2. Update `supabase-schema.sql` RLS policies to use `auth.uid()`
3. Add a login screen component

This is a ~1 day project when you're ready.

---

## Project Structure

```
vet-tracker/
├── src/
│   ├── App.jsx              # Main UI — all tabs
│   ├── main.jsx             # React entry point
│   └── lib/
│       ├── supabase.js      # Supabase client (singleton)
│       └── dataService.js   # All data logic — swap this for a new backend
├── .env                     # Your secrets (never commit this)
├── .gitignore               # Keeps .env out of git
├── supabase-schema.sql      # Run once in Supabase SQL editor
├── vite.config.js
└── package.json
```

## Swapping the Backend

All database logic lives in `src/lib/dataService.js`. To move to a different backend (Postgres, Firebase, etc.), only that file needs to change. The rest of the app calls the same function names regardless of storage backend.
