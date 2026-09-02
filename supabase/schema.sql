create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'active',
  description text,
  key_decisions text,
  updated_at timestamptz not null default now()
);

create table if not exists preferences (
  key text primary key,
  value text not null
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  role text not null check (role in ('user', 'assistant', 'summary')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  tool_name text not null,
  risk_level int not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists pending_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  tool_name text not null,
  input jsonb not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  due_at timestamptz,
  created_at timestamptz not null default now()
);
