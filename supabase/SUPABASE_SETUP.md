# Supabase Setup Guide — 3B Fleet Commander

> Run this document's instructions in the Supabase Dashboard for your Fleet Commander project.
> **DO NOT** run these as SQL — they are dashboard/config settings.

## 1. Authentication Providers

### Email / Password (Built-in, enabled by default)
No action needed — Supabase Auth includes email/password out of the box.

### Magic Link (Passwordless Email)
Enable in **Supabase Dashboard → Authentication → Providers → Email**:
- Toggle **Confirm email** OFF (magic link auth requires this)
- **Secure email change**: ON (recommended)
- **Minimum password length**: 8 (only applies to password-based signup)

### Google OAuth
Enable in **Supabase Dashboard → Authentication → Providers → Google**:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials (Web application type)
3. Set Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. Enable and paste in Supabase Dashboard

### Spotify OAuth
Enable in **Supabase Dashboard → Authentication → Providers → Spotify**:
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create/select an app → Edit Settings
3. Set Redirect URIs: `https://<project>.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. Enable and paste in Supabase Dashboard

### Auth Configuration (global)
**Supabase Dashboard → Authentication → Settings**:
- **Site URL**: `https://fleet.bouncebackbrian.com` (or your domain)
- **Redirect URLs**: `https://fleet.bouncebackbrian.com/**`
- **JWT expiry**: 3600 seconds (1 hour — default)
- **Session duration**: Configurable — recommended 24h for drivers
- **Enable email confirmations**: Recommended OFF for driver UX (or ON for fleet-managed)
- **Security**: Enable **Protect against brute force** and **Rate limiting**

## 2. Realtime (Broadcast & Presence)

**Supabase Dashboard → Realtime**

Enable Realtime on the following tables for live updates:

| Table | Mode | Purpose |
|-------|------|---------|
| `fleet_loads` | INSERT, UPDATE, DELETE | Trip updates, status changes |
| `fleet_missions` | INSERT, UPDATE, DELETE | Active mission progress |
| `fleet_load_stops` | INSERT, UPDATE, DELETE | Stop lifecycle changes |
| `fleet_driver_updates` | INSERT, UPDATE | Driver status messages |
| `fleet_alerts` | INSERT | Live alert push |
| `hos_logs` | INSERT | Live HOS status changes |
| `hos_shifts` | INSERT, UPDATE | Shift start/end |
| `fleet_fuel_purchases` | INSERT | New fuel transactions |
| `fleet_emergency_events` | INSERT, UPDATE | Emergency alert push |
| `driver_reward_events` | INSERT | Live reward notifications |

**To enable**: Run this SQL for each table (replace `table_name`):
```sql
alter publication supabase_realtime add table public.table_name;
```

Or enable all at once:
```sql
-- Realtime publication for Fleet Commander
create publication if not exists fleet_commander_realtime;
alter publication fleet_commander_realtime add table public.fleet_loads;
alter publication fleet_commander_realtime add table public.fleet_missions;
alter publication fleet_commander_realtime add table public.fleet_load_stops;
alter publication fleet_commander_realtime add table public.fleet_driver_updates;
alter publication fleet_commander_realtime add table public.fleet_alerts;
alter publication fleet_commander_realtime add table public.hos_logs;
alter publication fleet_commander_realtime add table public.hos_shifts;
alter publication fleet_commander_realtime add table public.fleet_fuel_purchases;
alter publication fleet_commander_realtime add table public.fleet_emergency_events;
alter publication fleet_commander_realtime add table public.driver_reward_events;
```

> **Note**: Realtime replicas use a shared publication (`supabase_realtime`) on the Free/Pro plan. The `fleet_commander_realtime` publication is for documentation — in practice use `supabase_realtime` default pub unless on Team/Enterprise.

## 3. Storage Buckets

**Supabase Dashboard → Storage → Create bucket**

Create the following storage buckets with public read access:

| Bucket Name | Public | Purpose | File Types Allowed |
|-------------|--------|---------|-------------------|
| `bol_documents` | Yes | Bills of Lading | PDF, PNG, JPG, JPEG, WEBP |
| `pod_documents` | Yes | Proof of Delivery | PDF, PNG, JPG, JPEG, WEBP |
| `fuel_receipts` | Yes | Fuel & DEF receipts | PDF, PNG, JPG, JPEG, WEBP |
| `inspection_photos` | Yes | DOT inspection photos | PNG, JPG, JPEG, WEBP, HEIC |
| `driver_documents` | No (authenticated) | CDL, medical card, endorsements | PDF, PNG, JPG, JPEG, WEBP |
| `load_documents` | Yes | Rate cons, lumper receipts, scale tickets | PDF, PNG, JPG, JPEG, WEBP |
| `repair_documents` | Yes | Repair invoices, photos | PDF, PNG, JPG, JPEG, WEBP |
| `vehicle_photos` | Yes | Truck/trailer photos | PNG, JPG, JPEG, WEBP |
| `profile_photos` | Yes | Driver profile photos | PNG, JPG, JPEG, WEBP |
| `receipts_ocr` | No (private) | Temp storage for OCR processing | PDF, PNG, JPG, JPEG, WEBP |
| `emergency_photos` | Yes | Emergency/incident scene photos | PNG, JPG, JPEG, WEBP |

### Storage RLS Policies

For **public** buckets (`bol_documents`, `pod_documents`, `fuel_receipts`, `inspection_photos`, `load_documents`, `repair_documents`, `vehicle_photos`, `profile_photos`, `emergency_photos`):

```sql
-- Allow authenticated users to read publicly
create policy "public_read" on storage.objects
  for select using (bucket_id in (
    'bol_documents','pod_documents','fuel_receipts',
    'inspection_photos','load_documents','repair_documents',
    'vehicle_photos','profile_photos','emergency_photos'
  ));

-- Allow authenticated users to upload to these buckets
create policy "auth_insert" on storage.objects
  for insert with check (
    bucket_id in (
      'bol_documents','pod_documents','fuel_receipts',
      'inspection_photos','load_documents','repair_documents',
      'vehicle_photos','profile_photos','emergency_photos'
    )
    and auth.role() = 'authenticated'
  );

-- Users can only update/delete their own objects
create policy "own_update" on storage.objects
  for update using (owner = auth.uid());
create policy "own_delete" on storage.objects
  for delete using (owner = auth.uid());
```

For **private** buckets (`driver_documents`, `receipts_ocr`):

```sql
-- Only the owner and fleet managers can read driver documents
create policy "driver_docs_select" on storage.objects
  for select using (
    bucket_id = 'driver_documents'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.fleet_business_members fbm
        join public.fleet_loads fl on fl.business_id = fbm.business_id
        where fbm.user_id = auth.uid()
        and fbm.role in ('owner', 'admin', 'dispatcher', 'fleet_manager')
        and fl.driver_name = (
          select first_name || ' ' || last_name
          from public.profiles where id = owner::uuid
        )
      )
    )
  );

-- Only the owner can upload driver documents
create policy "driver_docs_insert" on storage.objects
  for insert with check (
    bucket_id = 'driver_documents'
    and auth.role() = 'authenticated'
  );

-- OCR bucket: service role only
create policy "ocr_service_only" on storage.objects
  for all using (
    bucket_id = 'receipts_ocr'
    and auth.role() = 'service_role'
  ) with check (
    bucket_id = 'receipts_ocr'
    and auth.role() = 'service_role'
  );
```

## 4. Edge Functions

Deploy Supabase Edge Functions (Deno-based) for server-side processing.

**Directory**: `supabase/functions/`

### Deploy all functions:
```bash
supabase functions deploy ocr-process-receipt --no-verify-jwt
supabase functions deploy ai-copilot --no-verify-jwt
supabase functions deploy hos-violation-check
supabase functions deploy spotify-playlist-generator
supabase functions deploy emergency-alert
```

> `--no-verify-jwt` is intentional for functions called from the client-side with the anon key. Functions that contain sensitive logic use `--verify-jwt` by default.

### Required secrets:
```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set SPOTIFY_CLIENT_ID=...
supabase secrets set SPOTIFY_CLIENT_SECRET=...
supabase secrets set TWILIO_ACCOUNT_SID=...
supabase secrets set TWILIO_AUTH_TOKEN=...
supabase secrets set TWILIO_FROM_NUMBER=+1...
supabase secrets set EMERGENCY_SMS_NUMBERS=+1...,+1...
```

## 5. Additional Configuration

### CORS (if needed for custom domains)
**Supabase Dashboard → API → Settings**:
- Add your app domain(s) to CORS allowlist:
  - `https://fleet.bouncebackbrian.com`
  - `http://localhost:3000` (development)

### API Settings
**Supabase Dashboard → API → Settings**:
- **JWT Secret**: Use auto-generated (do not change)
- **Schema**: `public` (default)
- **Max rows per request**: 1000 (default is fine)
- **DB Pooler**: Enable for production (connection pooling)

### Webhooks (optional)
For Stripe billing integration:
```sql
-- Example: listen for stripe subscription events
-- Configure in Supabase Dashboard → Database → Webhooks
-- On INSERT to profiles.stripe_customer_id — sync customer
```

---

> **After completing this setup**, update `.env.local` with your Supabase project URL and anon key from **Supabase Dashboard → Settings → API**.