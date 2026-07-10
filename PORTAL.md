# Breeze Swim Client Portal

Parent onboarding portal + Brielle admin hub for Breeze Swim.

## Quick start (local)

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (free tier is fine)
2. **Settings → API** — copy **Project URL** and **publishable** (or anon) key

### 2. Run database migrations

In the Supabase dashboard → **SQL Editor** → New query:

- **New project:** paste and run **`supabase/setup.sql`** (all migrations)
- **Already ran setup.sql?** run **`supabase/migrations/004_payments_messages.sql`** only

### 3. Configure auth redirects

**Authentication → URL configuration:**

- Site URL: `http://localhost:5173/portal/` (dev) or your production portal URL
- Redirect URLs (add both):
  - `http://localhost:5173/portal/auth/callback`
  - `https://yoursite.com/portal/auth/callback` (when live)

**Authentication → Providers → Email:** leave magic link enabled.

### 4. Portal environment

```bash
cd portal
cp .env.example .env.local
# Edit .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open http://localhost:5173/portal/

### 5. Brielle admin access

**Option A — magic link** (needs custom SMTP; see Email section below)  
Sign in with **breezeswimlessons@gmail.com** at `/portal/login`.

**Option B — password (if dashboard add-user fails)**  
From repo root with your **service_role** key (Settings → API — never commit this):

```bash
SUPABASE_SERVICE_ROLE_KEY=your_secret_key \
VITE_SUPABASE_URL=https://your-project.supabase.co \
node scripts/create-admin-user.mjs breezeswimlessons@gmail.com 'YourPassword123'
```

Then `/portal/login` → **Sign in with password instead**.

**Option C — Supabase dashboard**  
Authentication → Users → **Add user** → **Create new user** (not Invite).  
Email, password (8+ chars), enable **Auto Confirm User**.

Then go to **Admin → Families → Add family → Send login**.

## What Brielle can do (admin)

| Area | Path | Actions |
|------|------|---------|
| **Today** | `/admin` | Active families, payments due, parent note alerts |
| **Payments** | `/admin/payments` | Generate weekly $90 ledger, mark paid (Zelle/cash/Square), registration fees |
| **Families** | `/admin/families` | Add/edit families, send & resend login, caregiver invites |
| **Send email** | `/admin/email` | Weather cancel, payment reminder, custom blast to one or all families |

## What parents see

- Magic-link login → welcome checklist → dashboard
- Schedule, swimmers, location (gate instructions)
- **Payments** (primary parent only): balance due, history, Zelle instructions
- **Messages** from Brielle (portal inbox + email when Resend is configured)
- Guest caregivers: schedule & messages only — no payment info

## Email (optional but recommended)

Deploy edge functions and set secrets in **Edge Functions → Secrets**:

- `RESEND_API_KEY` — from [resend.com](https://resend.com)
- `RESEND_FROM` — e.g. `Breeze Swim <hello@yourdomain.com>` after domain verification

Functions:

| Function | Purpose |
|----------|---------|
| `send-family-invite` | Login invite email |
| `send-email` | Announcements & custom messages |
| `mark-payment-paid` | Mark paid + thank-you email |
| `generate-weekly-payments` | Create $90 due rows for active families |

Without Resend, portal features still work — copy invite links manually; messages save to parent inbox.

Deploy with [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase functions deploy send-family-invite
supabase functions deploy send-email
supabase functions deploy mark-payment-paid
supabase functions deploy generate-weekly-payments
```

## Weekly payment workflow

1. **Admin → Payments → Generate this week** — creates $90 due rows for active enrollments
2. Parent pays via Zelle/cash/Square
3. **Mark paid** — logs payment, adds portal message, emails parent (if Resend configured)

Registration fees ($50/year) are auto-created when you open a family profile.

## Production build

```bash
cd portal
npm run build
```

Deploy `portal/dist/` to your host under `/portal/` (matches `vite.config.ts` base path).

Marketing site **Client Login** → `/portal/`

## Out of scope (for now)

- Waitlist pipeline (Google Form stays)
- Square API sync
- SMS
- Online card checkout
- Automated lesson-reminder cron (use Send email templates manually)
