alter table public.profiles enable row level security;
alter table public.upload_jobs enable row level security;
alter table public.transactions enable row level security;
alter table public.user_category_overrides enable row level security;
alter table public.csv_format_fingerprints enable row level security;
alter table public.spending_signals enable row level security;
alter table public.monthly_reports enable row level security;
alter table public.merchant_categories enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid());

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy profiles_delete_own
  on public.profiles
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy upload_jobs_select_own
  on public.upload_jobs
  for select
  to authenticated
  using (user_id = auth.uid());

create policy upload_jobs_insert_own
  on public.upload_jobs
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy upload_jobs_update_own
  on public.upload_jobs
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy upload_jobs_delete_own
  on public.upload_jobs
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy transactions_select_own
  on public.transactions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy transactions_insert_own
  on public.transactions
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy transactions_update_own
  on public.transactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy transactions_delete_own
  on public.transactions
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy user_category_overrides_select_own
  on public.user_category_overrides
  for select
  to authenticated
  using (user_id = auth.uid());

create policy user_category_overrides_insert_own
  on public.user_category_overrides
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy user_category_overrides_update_own
  on public.user_category_overrides
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_category_overrides_delete_own
  on public.user_category_overrides
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy csv_format_fingerprints_select_own
  on public.csv_format_fingerprints
  for select
  to authenticated
  using (user_id = auth.uid());

create policy csv_format_fingerprints_insert_own
  on public.csv_format_fingerprints
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy csv_format_fingerprints_update_own
  on public.csv_format_fingerprints
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy csv_format_fingerprints_delete_own
  on public.csv_format_fingerprints
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy spending_signals_select_own
  on public.spending_signals
  for select
  to authenticated
  using (user_id = auth.uid());

create policy spending_signals_insert_own
  on public.spending_signals
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy spending_signals_update_own
  on public.spending_signals
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy spending_signals_delete_own
  on public.spending_signals
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy monthly_reports_select_own
  on public.monthly_reports
  for select
  to authenticated
  using (user_id = auth.uid());

create policy monthly_reports_insert_own
  on public.monthly_reports
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy monthly_reports_update_own
  on public.monthly_reports
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy monthly_reports_delete_own
  on public.monthly_reports
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy merchant_categories_select_authenticated
  on public.merchant_categories
  for select
  to authenticated
  using (true);
