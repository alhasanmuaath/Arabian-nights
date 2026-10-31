-- The app owner is the first manager. After running the SQL, open the app,
-- enter this email on the login page, and type the 6-digit code you receive.
-- (Change the name any time on the People screen.)
insert into public.people (name, email, role)
values ('Muaath', 'alhasanmuaath@gmail.com', 'manager')
on conflict (email) do update set role = 'manager';
