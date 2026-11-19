-- ============================================================
-- Truvify — Complete Idempotent Supabase Schema
-- Run in Supabase Dashboard → SQL Editor.
-- Safe to run on a brand new project or re-run on an existing one.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table: public.documents
-- Stores uploaded research files, metadata, scores, and status.
-- ------------------------------------------------------------
create table if not exists public.documents (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users on delete cascade,
  file_name           text not null,
  file_format         text,                 -- pdf | docx | xlsx | pptx
  file_size           integer,              -- bytes
  domain              text,                 -- Medical | Historical | Geological | Student assignment | Legal | General research
  page_count          integer,
  claim_count         integer,
  trust_score         integer,              -- 0-100 (null if 0 claims)
  flag                text,                 -- green | amber | red
  saved               boolean not null default false,
  status              text not null default 'processing',   -- processing | done | failed
  chunks_processed    integer,
  databases_used      text[],
  time_taken_seconds  integer,
  extracted_text      text,                 -- full text extracted from the document
  corrected_text      text,                 -- edited text version for re-verification
  storage_path        text,                 -- path in documents bucket: {user_id}/{document_id}/{file_name}
  source_changes      jsonb,                -- array of retraction/correction notices
  error               text,                 -- error message if status is failed
  created_at          timestamptz not null default now()
);

-- Ensure all required columns exist if upgrading from an older schema version
alter table public.documents add column if not exists source_changes jsonb;
alter table public.documents add column if not exists error text;
alter table public.documents alter column user_id set default auth.uid();

-- Ensure status check constraint exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documents_status_check'
  ) then
    alter table public.documents add constraint documents_status_check check (status in ('processing', 'done', 'failed'));
  end if;
end $$;

-- Fast index for user documents ordered by date
create index if not exists documents_user_created_idx on public.documents (user_id, created_at desc);

-- ------------------------------------------------------------
-- 2. Table: public.claims
-- Stores extracted factual claims, citations, verdicts, and evidence.
-- ------------------------------------------------------------
create table if not exists public.claims (
  id                          uuid primary key default gen_random_uuid(),
  document_id                 uuid not null references public.documents on delete cascade,
  user_id                     uuid not null default auth.uid() references auth.users on delete cascade,
  claim_text                  text not null,
  citation_id                 text,          -- marker as written: e.g. "[3]" or "(Smith, 2019)"
  citation_full_reference     text,
  citation_doi                text,
  page_number                 integer,
  verdict                     text not null check (verdict in
                                ('supported','partly_supported','unsupported','contradicted','not_found','likely_fabricated')),
  evidence_quote              text,
  explanation                 text,
  evidence_strength           text check (evidence_strength in ('High','Medium','Low')),
  retrieval_quality           text check (retrieval_quality in ('Full text','Abstract only','Title only','Not retrievable')),
  uncertainty_note            text,
  date_conflict               jsonb,         -- {claimed_date, actual_date, source}
  outdated                    boolean not null default false,
  paper_year                  integer,
  newer_paper                 jsonb,         -- {title, year, doi, finding, citation}
  needs_human_review          boolean not null default false,
  user_override_verdict       text check (user_override_verdict is null or user_override_verdict in
                                ('supported','partly_supported','unsupported','contradicted','not_found','likely_fabricated')),
  user_override_reason        text,
  user_flagged                boolean not null default false,
  fabrication_signals_failed  integer not null default 0,
  fabrication_detail          jsonb,         -- {doi_resolved, journal_found, title_found, authors_found}
  suggested_fix               text,          -- corrected version of the claim sentence
  databases_searched          text[],
  source_used                 text,
  raw_passage                 text,
  created_at                  timestamptz not null default now()
);

-- Ensure user_id defaults to auth.uid()
alter table public.claims alter column user_id set default auth.uid();

-- Fast index to lookup claims by document
create index if not exists claims_document_idx on public.claims (document_id);

-- ------------------------------------------------------------
-- 3. Table: public.chat_messages
-- Stores conversation messages between the user and AI for a specific report.
-- ------------------------------------------------------------
create table if not exists public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) <= 8000),
  created_at  timestamptz not null default now()
);

-- Fast index to load chat history in chronological order
create index if not exists chat_messages_doc_idx on public.chat_messages (document_id, created_at asc);

-- ------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- Each user has strict access to their own records only.
-- ------------------------------------------------------------
alter table public.documents     enable row level security;
alter table public.claims        enable row level security;
alter table public.chat_messages enable row level security;

-- Documents RLS policies
drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
  on public.documents for select
  using (auth.uid() = user_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
  on public.documents for insert
  with check (auth.uid() = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
  on public.documents for delete
  using (auth.uid() = user_id);

-- Claims RLS policies
drop policy if exists "claims_select_own" on public.claims;
create policy "claims_select_own"
  on public.claims for select
  using (auth.uid() = user_id);

drop policy if exists "claims_insert_own" on public.claims;
create policy "claims_insert_own"
  on public.claims for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.documents d
      where d.id = document_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "claims_update_own" on public.claims;
create policy "claims_update_own"
  on public.claims for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.documents d
      where d.id = document_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "claims_delete_own" on public.claims;
create policy "claims_delete_own"
  on public.claims for delete
  using (auth.uid() = user_id);

-- Chat messages RLS policies
-- Users can only read and delete their own messages.
-- Users can insert only 'user' role messages; 'assistant' messages are inserted by the Edge Function via the service role.
drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own"
  on public.chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "chat_messages_insert_user" on public.chat_messages;
create policy "chat_messages_insert_user"
  on public.chat_messages for insert
  with check (auth.uid() = user_id and role = 'user');

drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own"
  on public.chat_messages for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 5. Permissions
-- Grant table privileges to authenticated users, revoke from anon.
-- ------------------------------------------------------------
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.claims to authenticated;
grant select, insert, update, delete on public.chat_messages to authenticated;

revoke all on public.documents from anon;
revoke all on public.claims from anon;
revoke all on public.chat_messages from anon;

-- ------------------------------------------------------------
-- 6. Storage Bucket: documents
-- Private bucket for uploaded research drafts (max 20MB).
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  20971520, -- 20MB limit
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];

-- Storage RLS: Users can only access objects in their own folder ({user_id}/*)
drop policy if exists "documents_storage_select" on storage.objects;
create policy "documents_storage_select"
  on storage.objects for select
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "documents_storage_insert" on storage.objects;
create policy "documents_storage_insert"
  on storage.objects for insert
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "documents_storage_update" on storage.objects;
create policy "documents_storage_update"
  on storage.objects for update
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "documents_storage_delete" on storage.objects;
create policy "documents_storage_delete"
  on storage.objects for delete
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- 7. OPTIONAL: 30-day automated cleanup of unsaved documents
-- This block uses pg_cron if available on your Supabase project.
-- It is safely wrapped so any error here does not prevent the rest
-- of the schema script from completing successfully.
-- ============================================================
do $$
begin
  create extension if not exists pg_cron;
  begin
    perform cron.unschedule('truvify-cleanup');
  exception when others then
    null;
  end;
  perform cron.schedule(
    'truvify-cleanup',
    '0 3 * * *',
    'delete from public.documents where saved = false and created_at < now() - interval ''30 days'''
  );
exception when others then
  raise notice 'pg_cron could not be configured (this is optional and safe to ignore): %', sqlerrm;
end $$;
