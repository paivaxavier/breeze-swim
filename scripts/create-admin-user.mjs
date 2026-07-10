#!/usr/bin/env node
/**
 * Create (or update) the Brielle admin user when the Supabase dashboard won't cooperate.
 *
 * Usage:
 *   cd portal
 *   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key node ../scripts/create-admin-user.mjs \
 *     breezeswimlessons@gmail.com 'YourSecurePassword123'
 *
 * Get the service role key: Supabase → Project Settings → API → service_role (secret)
 * Never commit this key or expose it in the browser.
 */

const email = process.argv[2]
const password = process.argv[3]
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!email || !password) {
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-admin-user.mjs <email> <password>')
  process.exit(1)
}

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

const base = url.replace(/\/$/, '')
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
}

async function findUserByEmail() {
  const res = await fetch(`${base}/auth/v1/admin/users?per_page=200`, { headers })
  const json = await res.json()
  if (!res.ok) throw new Error(json.msg || json.message || res.statusText)
  const users = json.users || []
  return users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
}

async function createUser() {
  const res = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Brielle Goldberg' },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.msg || json.message || JSON.stringify(json))
  return json
}

async function updateUser(id) {
  const res = await fetch(`${base}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      password,
      email_confirm: true,
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.msg || json.message || JSON.stringify(json))
  return json
}

async function main() {
  console.log(`Checking for existing user: ${email}`)
  const existing = await findUserByEmail()

  if (existing) {
    console.log('User already exists — updating password and confirming email…')
    await updateUser(existing.id)
    console.log('Done. Sign in at /portal/login with "Sign in with password instead".')
    return
  }

  console.log('Creating new user…')
  await createUser()
  console.log('Done. Sign in at /portal/login with "Sign in with password instead".')
  console.log('This email becomes admin automatically via the database trigger.')
}

main().catch((err) => {
  console.error('Failed:', err.message)
  process.exit(1)
})
