# Arabian Nights: shoot schedule and crew

A mobile-first web app for planning shoot days and running them: who will be there, where and when to meet,
photos of the place, scripts, announcements, files and pay. Next.js + Supabase (login, database, file storage).
Dark "night sky" glass design.

## Who can do what

| | Manager | Photographer | Organizer | Model |
|---|---|---|---|---|
| See every shoot day, crew and answers | yes | yes | yes | yes |
| Create / edit shoot days, crew, fees, scripts | yes | no | no | no |
| Set location, add photos of the place | yes | no | **yes** | no |
| Accept, or decline with a reason | n/a | yes | yes | yes |
| Announcements and files | all, publishes | read all | read all | read **assigned to her** |
| Comment and mark "reviewed" | yes | yes (all) | yes (all) | yes (what she can see) |
| See pay | everyone's | own | own | own |
| Invite people, set roles, export | yes | no | no | no |

Everything is enforced **in the database** (row-level security), not just hidden in the screens.
Decline reasons are visible only to the manager and the person who wrote them.
Availability is no longer used; old data is kept.

## Logging in

People log in with **email and password**.
- **Invitation:** the manager invites someone on People. They get an email with a link to a page where they
  choose their password (the link works once; see the email-expiry setting below).
- **Forgot password / first time (older accounts):** `/forgot-password` emails a 6-digit code. They enter the code
  and a new password.
- **Change password:** Me → Change password.

### Where the login emails come from

The reset code and the invitation are sent **by the app itself** through your mailbox, so they always look the same
(`src/lib/emails.ts`). Set these four variables in Vercel (Project → Settings → Environment Variables) and redeploy:
`SMTP_HOST` (`mail.privateemail.com`), `SMTP_PORT` (`465`), `SMTP_USER` (the full mailbox address), `SMTP_PASS`
(its password), and `SMTP_FROM` (for example `Arabian Nights <info@arabiannights.space>`).

Without them the app falls back to Supabase's own emails. Then paste `supabase/templates/invite.html` into
**Authentication → Emails → Templates → Invite user** and `supabase/templates/recovery.html` into **Reset password**.
Either way set **Authentication → Sign In / Providers → Email → Email OTP Expiration** to `86400`, otherwise
invitation links stop working after 1 hour. A reset code can be requested once a minute per person.

## Screens

Home (next shoot, crew, answers needed, season progress, latest news) · Shoots (calendar + list) ·
Shoot day (meeting point, time, map link and instructions, location and map link, photos, scripts, crew, comments) ·
News · Files · My pay / Pay (manager) · People (manager) · Notifications · Me.

## Split shoot days

A shoot day can run in two sessions, for example 2 hours in the morning and 2 hours in the evening. Tick
"Split into two sessions" when creating or editing a shoot day and give each session a start time and hours.
It is still one shoot day: one crew, one payment, and both sessions together are at most 4 hours.

## Motion

The app moves in depth, always (there is no switch, and it ignores the device's "reduce motion" setting). Screens turn
sideways between tabs, a shoot day opens toward you and returns when you go back, the sky has three layers that drift
at different speeds, cards lean toward the pointer or a pressed finger, and small things arrive with their own move
(calendar leaf flip, avatars, progress bars, the sliding tab highlight). Only transform and opacity are animated and each
move is under half a second, so it stays smooth on phones. The rules live at the end of `src/app/globals.css`; the screen
changes are set in `src/app/(app)/template.tsx`.

## Speed

Logins are verified on the server without calling the auth service on every click, pages fetch their data in one
round of queries, the main sections are prefetched, and `vercel.json` runs the server in Frankfurt next to the database.

## Pay

Marking a shoot day **completed** adds a pay line for each model who did not decline (the day rate) and for
anyone with an **agreed fee** on that day (photographers, organizers). Paid lines are protected: a day with a paid
line cannot be un-completed or deleted until it is marked not paid.

## Database changes

Migrations are in `supabase/migrations/` and must run in order.
`20261116000000_live_baseline.sql` records the changes that were made by hand in the Supabase editor before
(announcements, files, notifications, photographers) so a fresh database matches live.
`20261116000100_crew_and_shoot_details.sql` is the crew / details / comments change. It **merges** the old
one-row-per-model shoot days into one shoot day per date. Every payment, amount and paid flag is kept
(the migration refuses to continue if a payment would be lost). Take a backup before running it on live.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the Supabase URL, publishable key and secret key
npm run dev
```

## Tests (need Docker; they use a LOCAL Supabase, never the live one)

```bash
npx supabase start
npm run test:db          # ~120 row-level-security and automation checks
npm run test:migration   # legacy-shaped data survives the crew migration
python3 tests/make-fixtures.py && npm run build && npm start   # then, in another terminal:
npm run test:e2e         # ~50 phone-sized browser checks, one login per role
```
