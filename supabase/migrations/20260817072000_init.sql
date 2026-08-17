create extension if not exists pgcrypto with schema extensions;

create type public.transaction_category as enum (
  '식비',
  '카페/간식',
  '생활/마트',
  '교통',
  '주거/통신',
  '쇼핑',
  '의료/건강',
  '문화/여가',
  '금융/보험',
  '기타'
);

create type public.transaction_type as enum (
  'expense',
  'refund',
  'deposit'
);

create type public.upload_job_status as enum (
  'pending',
  'parsing',
  'needs_mapping',
  'categorizing',
  'completed',
  'failed'
);

create type public.subscription_status as enum (
  'trialing',
  'active',
  'canceled'
);

create type public.spending_signal_type as enum (
  'category_spike',
  'new_merchant_large',
  'outlier_transaction',
  'recurring_payment',
  'recurring_price_up'
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz not null default now(),
  subscription_status public.subscription_status not null default 'trialing',
  polar_customer_id text,
  current_period_end timestamptz
);

create table public.upload_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_key text not null,
  original_filename text not null,
  card_label text not null,
  header_hash text,
  status public.upload_job_status not null default 'pending',
  mapping jsonb,
  failed_reason text,
  inserted_count integer not null default 0 check (inserted_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  uncategorized_count integer not null default 0 check (uncategorized_count >= 0)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_job_id uuid not null references public.upload_jobs(id) on delete cascade,
  transacted_on date not null,
  amount bigint not null check (amount > 0),
  merchant_raw text not null,
  merchant_normalized text not null,
  category public.transaction_category,
  category_fallback boolean not null default false,
  transaction_type public.transaction_type not null,
  dedupe_key text not null unique
);

create table public.merchant_categories (
  merchant_normalized text primary key,
  category public.transaction_category not null
);

create table public.user_category_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_normalized text not null,
  category public.transaction_category not null,
  primary key (user_id, merchant_normalized)
);

create table public.csv_format_fingerprints (
  user_id uuid not null references auth.users(id) on delete cascade,
  header_hash text not null,
  mapping jsonb not null,
  primary key (user_id, header_hash)
);

create table public.spending_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period date not null,
  type public.spending_signal_type not null,
  target_key text not null,
  payload jsonb not null,
  impact bigint,
  narrative text,
  upload_job_id uuid not null references public.upload_jobs(id) on delete cascade,
  dismissed_at timestamptz,
  unique (user_id, type, period, target_key),
  check (impact is null or impact >= 0)
);

create table public.monthly_reports (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  narrative text not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, month)
);

create index transactions_user_transacted_on_idx
  on public.transactions (user_id, transacted_on);

create index transactions_user_merchant_normalized_idx
  on public.transactions (user_id, merchant_normalized);

create index spending_signals_user_period_idx
  on public.spending_signals (user_id, period);

create index upload_jobs_user_status_idx
  on public.upload_jobs (user_id, status);
