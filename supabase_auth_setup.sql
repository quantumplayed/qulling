-- 1. Enable pgvector
create extension if not exists vector;

-- 2. Drop existing mock tables to rewrite schema
drop table if exists public.annotations cascade;
drop table if exists public.paper_chunks cascade;
drop table if exists public.papers cascade;
drop table if exists public.profiles cascade;

-- 3. Profiles table referencing auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('admin', 'reviewer', 'user')) default 'user',
  name text,                        -- derived from email prefix on signup
  affiliation text,
  statistics jsonb not null default '{"annotations_count": 0, "papers_count": 0}'::jsonb,
  created_at timestamp with time zone default now()
);

-- 4. Enable Row Level Security (RLS) or add public access for simplicity
alter table public.profiles enable row level security;
create policy "Allow public read access to profiles" on public.profiles for select using (true);
create policy "Allow users to update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Allow admins to update all profiles" on public.profiles for update using (
  exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
);
create policy "Allow system/users to insert profile" on public.profiles for insert with check (true);

-- 5. Papers Catalog (linked to profiles via UUIDs)
create table public.papers (
  id text primary key,
  title text not null,
  authors text, -- Stores author name string for display
  year integer,
  source text default 'upload' check (source in ('upload', 'arxiv', 'pitch')),
  pdf_url text, -- For papers, public link; for pitches, raw pitch text
  status text default 'unassigned' check (status in ('unassigned', 'assigned', 'reviewing', 'completed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null, -- Links pitch to user profile
  assessment jsonb, -- {score, verdict, notes, reviewer_name, submitted_at}
  created_at timestamp with time zone default now()
);

alter table public.papers enable row level security;
create policy "Allow public read access to papers" on public.papers for select using (true);
create policy "Allow authenticated writes to papers" on public.papers for insert with check (auth.role() = 'authenticated');
create policy "Allow owners/assigned reviewers/admins to update papers" on public.papers for update using (
  auth.uid() = user_id or auth.uid() = assigned_to or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  )
);

-- 6. Annotations (using cascading delete)
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  paper_id text references public.papers(id) on delete cascade,
  text text not null,
  comment text not null,
  page integer not null,
  created_at timestamp with time zone default now()
);

alter table public.annotations enable row level security;
create policy "Allow public read access to annotations" on public.annotations for select using (true);
create policy "Allow reviewer to insert annotations" on public.annotations for insert with check (auth.role() = 'authenticated');
create policy "Allow reviewer to delete annotations" on public.annotations for delete using (auth.role() = 'authenticated');

-- 7. Paper Chunks (pgvector indexing)
create table public.paper_chunks (
  id bigserial primary key,
  paper_id text references public.papers(id) on delete cascade,
  content text not null,
  embedding vector(768),
  metadata jsonb
);

alter table public.paper_chunks enable row level security;
create policy "Allow public read access to chunks" on public.paper_chunks for select using (true);
create policy "Allow writes to chunks" on public.paper_chunks for insert with check (auth.role() = 'authenticated');

-- 8. pgvector Similarity Search RPC Function
create or replace function match_paper_chunks (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  paper_id text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    paper_chunks.id,
    paper_chunks.paper_id,
    paper_chunks.content,
    paper_chunks.metadata,
    1 - (paper_chunks.embedding <=> query_embedding) as similarity
  from paper_chunks
  where 1 - (paper_chunks.embedding <=> query_embedding) > match_threshold
  order by paper_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 9. Trigger: increment annotations_count on profile when a reviewer saves an annotation
create or replace function increment_annotation_count()
returns trigger as $$
begin
  update public.profiles
  set statistics = jsonb_set(
    statistics,
    '{annotations_count}',
    to_jsonb((coalesce((statistics->>'annotations_count')::int, 0) + 1))
  )
  where id = (
    select assigned_to from public.papers where id = NEW.paper_id
  );
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_annotation_count on public.annotations;
create trigger trg_annotation_count
  after insert on public.annotations
  for each row execute function increment_annotation_count();

-- 10. Trigger: increment papers_count on profile when a paper is marked 'completed'
create or replace function increment_papers_reviewed_count()
returns trigger as $$
begin
  if NEW.status = 'completed' and (OLD.status is distinct from 'completed') then
    update public.profiles
    set statistics = jsonb_set(
      statistics,
      '{papers_count}',
      to_jsonb((coalesce((statistics->>'papers_count')::int, 0) + 1))
    )
    where id = NEW.assigned_to;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_papers_reviewed_count on public.papers;
create trigger trg_papers_reviewed_count
  after update on public.papers
  for each row execute function increment_papers_reviewed_count();

-- 11. Supabase Storage Setup & RLS Policies for 'pdfs' bucket
-- Ensure bucket 'pdfs' is created
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', true)
on conflict (id) do update set public = true;

-- Enable RLS on storage.objects (normally enabled by default in Supabase)
alter table storage.objects enable row level security;

-- Drop existing policies if any to prevent duplicates
drop policy if exists "Allow Public Select on pdfs" on storage.objects;
drop policy if exists "Allow Authenticated Inserts on pdfs" on storage.objects;
drop policy if exists "Allow Authenticated Updates on pdfs" on storage.objects;
drop policy if exists "Allow Public Inserts on pdfs (Dev)" on storage.objects;
drop policy if exists "Allow Public Updates on pdfs (Dev)" on storage.objects;

-- Policy: Allow anyone (public) to view/download files
create policy "Allow Public Select on pdfs" on storage.objects
  for select using (bucket_id = 'pdfs');

-- OPTION A: Secure (Allow ONLY logged-in users to upload/update)
create policy "Allow Authenticated Inserts on pdfs" on storage.objects
  for insert with check (bucket_id = 'pdfs' and auth.role() = 'authenticated');

create policy "Allow Authenticated Updates on pdfs" on storage.objects
  for update using (bucket_id = 'pdfs' and auth.role() = 'authenticated');

-- OPTION B: Open (Allow anonymous uploads - use if uploads don't require sign-in)
-- Uncomment these if you want to allow upload without logging in:
-- create policy "Allow Public Inserts on pdfs (Dev)" on storage.objects
--   for insert with check (bucket_id = 'pdfs');
-- create policy "Allow Public Updates on pdfs (Dev)" on storage.objects
--   for update using (bucket_id = 'pdfs');

-- 12. Deletion Policies
-- Allow admins to delete papers (cascading deletes handle chunks and annotations automatically)
create policy "Allow admins to delete papers" on public.papers
  for delete using (
    exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- Allow authenticated users to delete files from pdfs storage bucket
create policy "Allow Authenticated Deletes on pdfs" on storage.objects
  for delete using (bucket_id = 'pdfs' and auth.role() = 'authenticated');


