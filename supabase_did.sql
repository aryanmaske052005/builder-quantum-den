-- ============================================================
-- DID & Verifiable Credentials Tables for Authen Ledger
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- 1. Create did_documents table
create table if not exists did_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) unique,
  did text not null unique,
  did_document jsonb not null,
  public_key text not null,
  created_at timestamptz default now()
);

-- 2. Create verifiable_credentials table
create table if not exists verifiable_credentials (
  id uuid primary key default gen_random_uuid(),
  holder_user_id uuid references profiles(id),
  issuer_did text not null,
  credential_type text not null,
  vc_json jsonb not null,
  issued_at timestamptz default now(),
  expires_at timestamptz,
  is_revoked boolean default false
);

-- 3. Enable RLS
alter table did_documents enable row level security;
alter table verifiable_credentials enable row level security;

-- 4. Permissive policies for server-side access via anon key
-- These allow the Express backend to perform all CRUD operations.
-- In production, you would use a service_role key instead and
-- add stricter user-facing policies.

-- did_documents: allow all operations
drop policy if exists "Allow all did_documents operations" on did_documents;
create policy "Allow all did_documents operations"
on did_documents for all
using (true)
with check (true);

-- verifiable_credentials: allow all operations
drop policy if exists "Allow all verifiable_credentials operations" on verifiable_credentials;
create policy "Allow all verifiable_credentials operations"
on verifiable_credentials for all
using (true)
with check (true);
