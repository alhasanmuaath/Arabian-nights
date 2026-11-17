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

## Screens

Home (next shoot, crew, answers needed, season progress, latest news) · Shoots (calendar + list) ·
Shoot day (meeting point and time, location and map link, photos, scripts, crew, comments) ·
News · Files · My pay / Pay (manager) · People (manager) · Notifications · Me.

## Split shoot days

A shoot day can run in two sessions, for example 2 hours in the morning and 2 hours in the evening. Tick
"Split into two sessions" when creating or editing a shoot day and give each session a start time and hours.
It is still one shoot day: one crew, one payment, and both sessions together are at most 4 hours.

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
npm run test:db          # ~110 row-level-security and automation checks
npm run test:migration   # legacy-shaped data survives the crew migration
python3 tests/make-fixtures.py && npm run build && npm start   # then, in another terminal:
npm run test:e2e         # ~50 phone-sized browser checks, one login per role
```
