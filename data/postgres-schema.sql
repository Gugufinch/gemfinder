-- BONAFIED PostgreSQL schema (production-ready MVP)
-- Uses text identifiers so clustered signal IDs remain stable across ingestion cycles.

create table if not exists sources (
  id text primary key,
  name text not null unique,
  home_url text not null default '',
  credibility_score double precision not null default 0.70,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feeds (
  id text primary key,
  source_id text,
  name text not null,
  rss_url text not null unique,
  category text not null,
  credibility_score double precision not null default 0.70,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists clusters (
  id text primary key,
  category text not null,
  headline text not null,
  primary_story_id text not null,
  story_ids jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  score double precision not null default 0,
  latest_published_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stories (
  id text primary key,
  cluster_id text,
  source_id text,
  title text not null,
  url text not null unique,
  source_name text not null,
  source_url text not null,
  category text not null,
  content text not null,
  summary text not null,
  why_matters jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  published_at timestamptz not null,
  image_url text,
  verified boolean not null default true,
  published_timestamp_known boolean not null default true,
  rank_score double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists entities (
  id text primary key,
  name text not null unique,
  kind text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists story_entities (
  story_id text not null,
  entity_id text not null,
  primary key (story_id, entity_id)
);

create table if not exists users (
  id text primary key,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists user_preferences (
  user_id text primary key,
  timezone text not null default 'America/Chicago',
  accent text not null default 'cobalt',
  only_24h boolean not null default true,
  followed_entities jsonb not null default '[]'::jsonb,
  muted_sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists filed_stories (
  user_id text not null,
  story_id text not null,
  filed_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

create table if not exists dossiers (
  id text primary key,
  user_id text not null,
  name text not null,
  notes text not null default '',
  story_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists magic_link_tokens (
  token text primary key,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
