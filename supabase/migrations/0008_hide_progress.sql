-- Hide scrape internals from the public REST surface. The app reads
-- scrape_progress over an *authenticated* anonymous session (role
-- `authenticated`), so the owner's admin dashboard keeps working; revoking
-- `anon` blocks reads made with only the publishable key and no session.
revoke select on public.scrape_progress from anon;
