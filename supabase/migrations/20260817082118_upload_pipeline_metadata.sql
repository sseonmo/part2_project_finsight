alter table public.upload_jobs
  add column mapping_attempt_count integer not null default 0
    check (mapping_attempt_count >= 0),
  add column card_label_mismatch_warning text;
