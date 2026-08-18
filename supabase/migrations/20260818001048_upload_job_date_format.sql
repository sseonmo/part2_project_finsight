alter table public.upload_jobs
  add column date_format text,
  add column date_format_resolved_by text,
  add column created_at timestamptz not null default now();
