# Shared Auth Architecture — Fleet Commander × 3B Ecosystem

> **Scope:** Defines how Fleet Commander authenticates users, shares session state
> across the `*.bouncebackbrian.com` domain, and migrates to Universal 3Boost Auth.
>
> **Status:** Temporary state (Fleet-local login) is LIVE.
> Final state (Universal 3Boost Auth) is PENDING 3Boost build.
>
> Last updated: 2026-06-07

---

## State Machine

```
[NOW]  Standalone Fleet Login   →   [NEXT] Fleet + Core_Eco JWT   →   [FINAL] Universal 3Boost Auth
       (goqzhdrmrdlkchmwfiur)                (shared JWT secret)                (3boost.bouncebackbrian.com)
       Fleet auth + Fleet data               Core_Eco auth + Fleet data          3Boost IdP + all products
```

---

## 1. Current (Temporary) State

### What is live today

```
User visits fleet.bouncebackbrian.com/dashboard (unauthenticated)
  ↓
middleware.ts redirects to:
  fleet.bouncebackbrian.com/login?returnTo=https://fleet.bouncebackbrian.com/dashboard
  ↓
Fleet-local login page (Supabase signInWithPassword)
  ↓ (success)
Sets Supabase session cookie on .bouncebackbrian.com
  ↓
redirect to returnTo → /dashboard ✅
```

### Project topology (today)

```
Supabase project: goqzhdrmrdlkchmwfiur
  auth.users          — Fleet user identity
  profiles            — 3B profile (name, role, businesses)
  businesses          — business registry
  business_members    — ecosystem governance roles
  fleet_*             — ALL fleet operational tables
```

Single Supabase project carries both auth AND fleet data. Auth is
Fleet-scoped only — other 3B products cannot share this session.

### Key env vars (today)

```
NEXT_PUBLIC_SUPABASE_URL   = https://goqzhdrmrdlkchmwfiur.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <fleet anon key>
SUPABASE_SERVICE_ROLE_KEY  = <fleet service role>
NEXT_PUBLIC_AUTH_MODE      = standalone
NEXT_PUBLIC_LOGIN_URL      = (unset — uses Fleet /login)
```

### What this state does NOT support

- Single sign-on across 3B products (`home.`, `3boost.`, `credit.`, etc.)
- Shared identity — a user who signs into Fleet cannot auto-access other 3B apps
- Entitlement validation from Core_Eco
- 3Boost billing + subscription linking

---

## 2. Final (Target) State — Universal 3Boost Auth

### Architecture

```
Core_Eco Supabase (separate project, e.g. xyzCore.supabase.co)
  auth.users          — canonical 3B user identities
  profiles            — 3B-U-00000001 sequential IDs
  businesses          — 3B-B-00000001 sequential IDs
  business_members    — ecosystem governance (owner/partner/manager/employee)

Fleet Supabase (goqzhdrmrdlkchmwfiur)
  fleet_business_members  — Fleet operational roles
  fleet_loads / fleet_ops_events / fleet_*  — fleet data only
  (auth.users NOT the source of truth)

3Boost App (3boost.bouncebackbrian.com)
  Universal login page
  Reads returnTo param → redirects after auth
  Sets session cookie on .bouncebackbrian.com

Fleet App (fleet.bouncebackbrian.com)
  middleware → validates session from Core_Eco
  auth-client → Core_Eco anon key (identity/session only)
  fleet-db-client → Fleet service role key (data only)
```

### Request flow (final state)

```
fleet.bouncebackbrian.com/dashboard (unauthenticated)
  ↓ middleware → no Core_Eco session cookie
  ↓ redirect to:
3boost.bouncebackbrian.com/login?returnTo=https://fleet.bouncebackbrian.com/dashboard
  ↓ user logs in (Supabase signInWithPassword against Core_Eco)
  ↓ 3Boost sets session cookie: domain=.bouncebackbrian.com, path=/
  ↓ 3Boost reads sanitized returnTo → redirect to Fleet
fleet.bouncebackbrian.com/dashboard (now authenticated)
  ↓ middleware reads Core_Eco session cookie → user present → pass through
  ↓ getCurrentUser() → calls Core_Eco auth.getUser()
  ↓ queries fleet_business_members (Fleet DB) where user_id = Core_Eco user.id
  ↓ resolves role, businessId, displayMode
  ↓ renders dashboard ✅
```

---

## 3. Design Questions — Answered

### Q1: Can Fleet use Core_Eco auth while reading/writing Fleet Supabase data?

**Yes.** Two clients, one per concern:

```typescript
// src/lib/auth-client.ts  (NEW — Core_Eco)
import { createBrowserClient } from '@supabase/ssr'
export const authClient = createBrowserClient(
  process.env.NEXT_PUBLIC_CORE_ECO_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_CORE_ECO_ANON_KEY!,
  { cookieOptions: { domain: '.bouncebackbrian.com', path: '/', sameSite: 'lax', secure: true } }
)

// src/lib/fleet-db.ts  (RENAME of current supabase-browser.ts)
import { createBrowserClient } from '@supabase/ssr'
export const fleetDb = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,       // Fleet Supabase
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookieOptions: { domain: '.bouncebackbrian.com', path: '/', sameSite: 'lax', secure: true } }
)
```

**Fleet RLS must validate Core_Eco JWTs.** Two options:

| Option | How | Trade-off |
|--------|-----|-----------|
| **A — Shared JWT secret** | Set Fleet Supabase JWT secret = Core_Eco JWT secret in project settings | One-time config change; RLS works natively on Fleet DB |
| **B — Service role + app-layer authz** | Fleet API routes always use service role key; app code validates user ID from Core_Eco session | No secret sharing needed; authz is explicit in code, not RLS |

**Recommendation: Option B** for now (no Supabase config dependency), with a path to A
once Core_Eco project ID is confirmed.

With Option B, the pattern in every Fleet API route is:

```typescript
// In any /api/fleet/* route:
const authClient = createAuthServerClient(request)
const { data: { user } } = await authClient.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// Then query Fleet DB as service role (bypasses RLS — app validates user)
const fleet = getSupabaseAdmin()
const { data } = await fleet.from('fleet_loads')
  .select('*')
  .eq('business_id', businessId)   // businessId resolved from fleet_business_members
```

---

### Q2: What cookie/session config is required for subdomains?

Every Supabase client across ALL 3B products must use identical cookie options:

```typescript
cookieOptions: {
  domain: '.bouncebackbrian.com',  // leading dot = all subdomains
  path: '/',
  sameSite: 'lax',
  secure: true,
}
```

**This is already in place in Fleet Commander** (both `supabase-browser.ts` and
`supabase-server.ts`). 3Boost's login page must set the same options when it
calls `supabase.auth.signInWithPassword()`.

**Critical:** If 3Boost uses a DIFFERENT Supabase URL than what Fleet's middleware
checks, the session cookie will be for a different project and Fleet will see no
user even after login. Both must point to the same Core_Eco Supabase URL.

---

### Q3: Should products use Core_Eco auth client + product DB service client?

**Yes. This is the canonical pattern:**

```
Product App
  ├── authClient     → Core_Eco Supabase (NEXT_PUBLIC_CORE_ECO_SUPABASE_URL)
  │     purpose: getUser(), signIn(), signOut(), session refresh
  │     anon key: NEXT_PUBLIC_CORE_ECO_ANON_KEY
  │
  └── productDbAdmin → Product Supabase (NEXT_PUBLIC_SUPABASE_URL)
        purpose: all product-specific data reads/writes
        service role key: SUPABASE_SERVICE_ROLE_KEY (server-only)
        authz: validate user.id from authClient before every write
```

The product DB never handles auth. The auth DB never stores product data.
Identity flows in one direction: Core_Eco user.id is the foreign key anchor
in every product's membership table.

---

### Q4: How does Fleet validate account context from Core_Eco?

**Step 1 — Identity:** Core_Eco's `auth.getUser()` returns `{ id, email }`.

**Step 2 — Fleet membership:** Query `fleet_business_members` in the Fleet DB:

```sql
SELECT fbm.role, fbm.business_id, b.name, b.type
FROM fleet_business_members fbm
JOIN businesses b ON b.id = fbm.business_id
WHERE fbm.user_id = $coreEcoUserId
  AND fbm.active = true
LIMIT 1;
```

This gives Fleet: `businessId`, `role`, `businessType` → all it needs to render
the correct UI mode (driver / dispatcher / owner_op).

**Step 3 — Entitlements (future):** Call `AUTH_3BOOST_URL/session/current`
with the Core_Eco JWT as Bearer token. Returns `{ billingState, planTier, entitlements }`.
This is already stubbed in `src/lib/threeb-session.ts`.

**Summary:**
```
Core_Eco auth.getUser()     → who is this person? (userId, email)
fleet_business_members      → what is their Fleet role + business?
threeb-session.ts (future)  → what are they entitled to?
```

---

### Q5: How does returnTo redirect avoid login loops?

**The loop condition:**
```
Fleet /dashboard → [no session] → login → [auth success] → Fleet /dashboard
                                                                   ↓
                                                          [still no session?]
                                                                   ↓
                                               → login again → infinite loop
```

**Root causes and mitigations:**

| Cause | Detection | Fix |
|-------|-----------|-----|
| 3Boost sets cookie on wrong domain | URL stays on 3Boost after login | 3Boost must use `domain=.bouncebackbrian.com` |
| 3Boost points to different Supabase project | Fleet middleware sees no user | Both must use same `NEXT_PUBLIC_CORE_ECO_SUPABASE_URL` |
| Fleet middleware env vars not set in Preview | Middleware passes all traffic (no auth check) | Ensure env vars are Preview-scoped in Vercel |
| returnTo URL not in allowlist | 3Boost rejects redirect, sends to home | Fleet returnTo must be `*.bouncebackbrian.com` |
| Cookie blocked by browser (third-party) | Works in desktop, fails in Safari | Use `sameSite=lax` not `strict`; subdomains on same eTLD+1 are fine |

**Sanitize returnTo in 3Boost (required):**

```typescript
const ALLOWED = /^https:\/\/([\w-]+\.)?bouncebackbrian\.com(\/.*)?$/

function sanitizeReturnTo(raw: string | null): string {
  if (!raw) return 'https://home.bouncebackbrian.com/dashboard'
  const decoded = decodeURIComponent(raw)
  if (ALLOWED.test(decoded)) return decoded
  return 'https://home.bouncebackbrian.com/dashboard'
}
// After auth success:
router.replace(sanitizeReturnTo(searchParams.get('returnTo')))
```

**Loop guard in Fleet middleware (already in place):**
`/login` is explicitly in the public paths list — middleware never redirects
an unauthenticated user away from `/login` itself, preventing the loop.

---

### Q6: What needs to change in Fleet to replace local auth with 3Boost?

**Minimal change set (5 steps):**

#### Step 1 — Set env vars in Vercel (no code change)
```
NEXT_PUBLIC_LOGIN_URL = https://3boost.bouncebackbrian.com/login
NEXT_PUBLIC_AUTH_MODE = ecosystem   (optional until auth-adapter is wired)
```

If Core_Eco Supabase is a DIFFERENT project from the current Fleet project:
```
NEXT_PUBLIC_SUPABASE_URL = https://<core-eco-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = <core-eco-anon-key>
```
(middleware currently uses `NEXT_PUBLIC_SUPABASE_URL` for session validation)

#### Step 2 — Split Supabase clients (one code change)

Rename `supabase-browser.ts` → keep as `auth-client.ts` pointing to Core_Eco.
Create `fleet-db.ts` pointing to Fleet Supabase (current project).
Update all imports in components that read fleet data to use `fleet-db.ts`.

#### Step 3 — Update auth-adapter.ts (one function change)

`getCurrentUser()` currently calls Fleet Supabase for auth. Change it to call
`authClient.auth.getUser()` (Core_Eco), then query `fleet_business_members` via
the Fleet DB admin client. The return shape does not change — no calling code updates.

#### Step 4 — Remove Fleet-local login form (optional, after validation)

Once 3Boost is confirmed working, `src/app/login/page.tsx` can be simplified back
to a redirect-only stub (or kept as emergency fallback with an env var toggle).

#### Step 5 — Wire threeb-session.ts entitlement check (one function change)

`getThreeBSession()` is already built. Change `hasActiveFleetAccess()` to call it
instead of the Supabase billing table. No UI changes.

---

## 4. Migration Path (Ordered)

```
Phase 0 — NOW (DONE)
  ✅ Fleet-local Supabase login (temporary unblock)
  ✅ Middleware redirects to NEXT_PUBLIC_LOGIN_URL (config-driven)
  ✅ Cookie domain = .bouncebackbrian.com (already correct)
  ✅ returnTo sanitization in Fleet login page

Phase 1 — Core_Eco Supabase identity confirmed
  [ ] Confirm Core_Eco Supabase project ID with Founder
  [ ] Add NEXT_PUBLIC_CORE_ECO_SUPABASE_URL + NEXT_PUBLIC_CORE_ECO_ANON_KEY to env
  [ ] Migrate auth.users to Core_Eco project (or confirm same project)
  [ ] Update middleware to use Core_Eco URL for session check

Phase 2 — 3Boost login page built
  [ ] 3Boost: login form with Supabase signInWithPassword (Core_Eco)
  [ ] 3Boost: cookie options domain=.bouncebackbrian.com
  [ ] 3Boost: sanitizeReturnTo() allowlist
  [ ] 3Boost: redirect to returnTo after auth success
  [ ] 3Boost: skip login if already authenticated
  Validate: Fleet → 3Boost → Fleet loop end-to-end test

Phase 3 — Split Fleet clients
  [ ] Create auth-client.ts (Core_Eco) + fleet-db.ts (Fleet)
  [ ] Update auth-adapter.ts getCurrentUser()
  [ ] Update middleware to use auth-client
  [ ] Verify RLS on Fleet DB still works (add service-role fallback if needed)

Phase 4 — Entitlements wired
  [ ] Wire threeb-session.ts to live 3Boost /session/current endpoint
  [ ] Replace billing-state stubs with live data
  [ ] Activate NEXT_PUBLIC_AUTH_MODE=ecosystem

Phase 5 — Cleanup
  [ ] Remove or demote Fleet-local login to emergency fallback
  [ ] Remove NEXT_PUBLIC_LOGIN_URL override (3Boost is the default)
  [ ] Update .env.example to reflect final state
```

---

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Core_Eco Supabase is same project as Fleet Supabase | High | Low | Clarify with Founder; if same project, no JWT split needed |
| 3Boost sets cookie on wrong domain | Medium | High | Require explicit cookie options review before Phase 2 |
| JWT secret mismatch breaks Fleet RLS | Medium | High | Use service-role + app-layer authz (Option B) to avoid RLS dependency |
| returnTo loop on Safari (ITP) | Low | Medium | Ensure same eTLD+1 (`*.bouncebackbrian.com`) — ITP does not block same eTLD+1 |
| Preview deployments break auth | Medium | Low | Env vars already Preview-scoped in Vercel; middleware passes if vars unset |
| 3Boost not built on time blocks Fleet launch | High | High | Fleet-local login stays active as fallback; flip `NEXT_PUBLIC_LOGIN_URL` to enable |

---

## 6. Open Questions (require Founder decision)

1. **Is Core_Eco Supabase the same project as the current Fleet Supabase (`goqzhdrmrdlkchmwfiur`)?**
   — If yes: no client split needed; session is already shared.
   — If no: Phase 1 and Phase 3 are blocking.

2. **Who owns the 3Boost login page build?**
   — Phase 2 is entirely blocked until this is assigned.

3. **When does `NEXT_PUBLIC_AUTH_MODE=ecosystem` get enforced?**
   — Drives whether Phase 4 entitlement wiring is pre-launch or post-launch.

---

*Document owner: S2 / Architecture*
*Trace_ID: 3B-20260604-0001 (auth domain activation)*
*Next review: when Phase 1 decisions are made*
