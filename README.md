# Shoot Scheduler

A plain, mobile-first internal tool for planning shoot days from **10 Nov to 10 Dec** (Cairo time).
Built with Next.js and Supabase (login + database).

## Who sees what

| | Manager | Member (edit) | Member (view) | Model |
|---|---|---|---|---|
| Everyone's availability and shoot days | edit | edit | view | **own only** |
| Targets | edit | view | view | view |
| Pay | edit, all models | none | none | **own only** |
| People / invites | edit | none | none | none |

These rules are enforced **inside the database** with row-level security (RLS), not just hidden in the
screens. A model's queries can only ever return her own rows.

## Screens

- **Login**: enter your email, receive a 6-digit code (or tap the link in the email). Only invited emails can log in.
- **My calendar** (model): month grid. Add free windows (start/end, 30-minute steps) to one or many dates. Max 6 h per day, split across as many windows as you like. Accept or decline offered shoot days.
- **My progress** (model): free time offered, hours booked, videos assigned, days completed.
- **My pay** (model): her own completed days, amount, paid / not paid, totals.
- **Manager dashboard** (manager + members): progress bars (hours booked, videos assigned, shoot days), targets, all shoot days, per-model summary, everyone's availability by date.
- **Pay manager** (manager): day rate, totals per model, mark each day paid / not paid, adjust amounts.
- **People** (manager): invite by email, set role (model / member / manager) and access (view / edit), remove.

## Rules the database enforces

- Availability dates must fall between 10 Nov and 10 Dec. Windows can't overlap, and each person has at most **6 hours per day**.
- A shoot day is at most 6 hours. Statuses: `free` (nobody) → `offered` (model assigned) → `confirmed` (model accepted) → `completed`.
- Marking a day **completed** automatically creates a pay line at the current day rate. A paid day can't be un-completed until it's marked not paid.
- There must always be at least one manager.

---

## Set up your real Supabase project (one time)

### 1. Create the project and copy the keys
1. Create a free project at supabase.com.
2. Go to **Project Settings → API Keys** and copy the **Project URL**, the **publishable** key and the **secret** key.
3. Copy `.env.example` to `.env.local` and paste them in. **Never share the secret key.**

### 2. Create the tables and security rules
Open **SQL Editor → New query** and run these two files, in this order (paste each one, click **Run**):
1. `supabase/migrations/20261101000000_schema.sql`: tables, rules and security
2. `supabase/migrations/20261101000100_initial_manager.sql`: makes **alhasanmuaath@gmail.com** the manager

### 3. Auth settings (in the Supabase dashboard)
1. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up". Keep **Email** enabled.
   Only people you invite can then log in.
2. **Authentication → URL Configuration**: set **Site URL** to your app's address
   (e.g. `https://shoot-scheduler.vercel.app`). While testing on your computer, add `http://localhost:3000` under Redirect URLs.
3. **Authentication → Emails → Templates → Magic Link**: set the subject to `Shoot Scheduler: your login code`
   and paste the contents of `supabase/templates/magic_link.html`. This puts the 6-digit code in the email.
4. **Authentication → Emails → SMTP Settings**: **set up a custom email sender** (for example Resend or Brevo,
   both free). Supabase's built-in sender only delivers to members of your Supabase team and only a few emails
   per hour, so invites to models' personal Gmail/Yahoo addresses won't arrive without this.

### 4. Run it and log in as the manager
```bash
npm install
npm run dev
```
Open http://localhost:3000, enter **alhasanmuaath@gmail.com**, and type the 6-digit code from your email.
You're the manager. Go to **People** to invite your models. (No sign-up step: because that email is on
the team list, the app creates its login the first time you ask for a code.)

To add another manager later, invite them on **People** with role "Manager", or run
`npm run add-manager -- "Name" email@example.com`.

### 5. Put it online (optional)
Deploy to Vercel, add the same three variables from `.env.local` under the project's **Environment Variables**,
and set the Supabase **Site URL** (step 3.2) to the Vercel address.

---

## Local testing (what was used to build this)

Needs Docker. This runs a full local Supabase with a fake mailbox at http://127.0.0.1:54324.

```bash
npx supabase start          # local database + auth + mailbox
cp .env.example .env.local  # then paste the local keys printed by `supabase start`
npm run seed                # 1 manager + 2 sample models (Sara, Mona) + sample data
npm run test:db             # 50 row-level-security checks
npm run build && npm start  # in another terminal
npm run test:e2e            # 34 browser checks (logs in as each person)
```

Test accounts (local only): `manager@example.com`, `sara@example.com`, `mona@example.com`.
Login codes arrive in the local mailbox.
