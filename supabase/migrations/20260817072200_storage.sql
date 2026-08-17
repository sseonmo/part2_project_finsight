insert into storage.buckets (id, name, public)
values ('transaction-csv-uploads', 'transaction-csv-uploads', false)
on conflict (id) do update
set public = excluded.public;

create policy transaction_csv_uploads_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'transaction-csv-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy transaction_csv_uploads_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'transaction-csv-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy transaction_csv_uploads_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'transaction-csv-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'transaction-csv-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy transaction_csv_uploads_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'transaction-csv-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
