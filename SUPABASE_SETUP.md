# Supabase Connection Setup

## 1. Paste your public keys into `js/app-config.js`

Open `js/app-config.js` and replace:

```js
SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
FUNCTIONS_BASE_URL: "https://YOUR_PROJECT_REF.supabase.co/functions/v1"
```

Use values from **Supabase Dashboard → Project Settings → API**:

```js
SUPABASE_URL: "https://abcxyz.supabase.co",
SUPABASE_ANON_KEY: "paste-your-anon-or-publishable-key-here",
FUNCTIONS_BASE_URL: "https://abcxyz.supabase.co/functions/v1"
```

Do not paste the `service_role` key in browser files.

## 2. Run the database schema

Go to **SQL Editor → New Query** and run:

```sql
-- paste supabase/schema.sql here
```

## 3. Create your first admin profile

Create the admin user in **Authentication → Users → Add user**. Copy the user UID, then run:

```sql
insert into public.profiles (auth_user_id, full_name, email, role, status)
values ('PASTE_AUTH_USER_UID', 'Admin Accountant', 'admin@pagbilao.edu.ph', 'super_admin', 'active')
on conflict (email) do update set role = 'super_admin', status = 'active';

insert into public.staff_accounts (auth_user_id, full_name, email, role, department, scope_type, status)
values ('PASTE_AUTH_USER_UID', 'Admin Accountant', 'admin@pagbilao.edu.ph', 'super_admin', 'Administration', 'system_wide', 'active')
on conflict (email) do update set role = 'super_admin', status = 'active';
```

## 4. Deploy Edge Functions for real account creation

From the project folder:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy create-school-account --no-verify-jwt
supabase functions deploy create-paymongo-checkout --no-verify-jwt
supabase functions deploy paymongo-webhook --no-verify-jwt
```

The `create-school-account` function is required so admin-created accounts appear in **Authentication → Users**.

## 5. Set PayMongo secrets and deploy Edge Functions

Run these commands in your terminal to set your PayMongo secret key for Live Mode:

```bash
# LIVE / TEST MODE:
supabase secrets set PAYMONGO_SECRET_KEY="sk_live_YOUR_PAYMONGO_SECRET_KEY_HERE"
supabase secrets set PAYMONGO_WEBHOOK_SECRET_KEY="whsk_YOUR_PAYMONGO_WEBHOOK_SECRET_KEY_HERE"
supabase secrets set PAYMONGO_SUCCESS_URL="http://localhost:5500/student-dashboard.html?payment=success"
supabase secrets set PAYMONGO_FAILED_URL="http://localhost:5500/student-dashboard.html?payment=failed"
```

Alternatively, set them in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:
- `PAYMONGO_SECRET_KEY` = `sk_live_YOUR_PAYMONGO_SECRET_KEY_HERE`
- `PAYMONGO_WEBHOOK_SECRET_KEY` = `whsk_YOUR_PAYMONGO_WEBHOOK_SECRET_KEY_HERE`
- `PAYMONGO_SUCCESS_URL` = `http://localhost:5500/student-dashboard.html?payment=success`
- `PAYMONGO_FAILED_URL` = `http://localhost:5500/student-dashboard.html?payment=failed`

## 6. Configure Webhook in PayMongo Dashboard

1. Log into your [PayMongo Dashboard](https://dashboard.paymongo.com/).
2. Make sure the toggle switch at the top is set to **Live Mode**.
3. Go to **Developers → Webhooks** (or Settings → Webhooks).
4. Click **Add Webhook**.
5. Set Webhook URL to:
   ```text
   https://wsbmowporxjagetqxtec.supabase.co/functions/v1/paymongo-webhook
   ```
6. Select the event:
   - `checkout_session.payment.paid`
7. Save the webhook.

## 7. Clear old browser prototype data

Open the app, press F12 → Console, then run the code in `docs/CLEAR_LOCAL_BROWSER_DATA.md`.

