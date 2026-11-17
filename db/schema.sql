-- The desk's tables. The same file runs on PostgreSQL 16 with pgvector and on PGlite.
create extension if not exists vector;

create table if not exists messages (
  message_id   text primary key,
  thread_id    text not null,
  received_at  timestamptz not null,
  sender       text not null,
  country      text not null,
  subject      text not null,
  body         text not null,
  attachments  jsonb not null default '[]'
);

create table if not exists outcomes (
  message_id   text primary key references messages (message_id),
  lang         text not null,
  intent       text not null,
  resolution   jsonb not null,
  route        text not null check (route in ('auto', 'review', 'human')),
  reason       text not null,
  reply        text,
  rma_number   text,
  checks       jsonb,
  drafts       int not null default 0,
  trace        jsonb not null,
  status       text not null check (status in ('sent', 'waiting', 'with_person', 'approved', 'rejected')),
  decided_by   text,
  decided_at   timestamptz
);

create table if not exists threads (
  thread_id    text primary key,
  rma_number   text not null
);

-- Stands in for SAP's return orders: the primary key makes a second order for one key impossible.
create table if not exists sap_orders (
  idempotency_key text primary key,
  rma_number      text not null unique,
  serial          text not null,
  sku             text not null,
  express         boolean not null,
  message_id      text not null,
  created_at      timestamptz not null default now()
);
create sequence if not exists rma_seq start 7000001;

create table if not exists kb_articles (
  id         text primary key,
  title      text not null,
  body       text not null,
  embedding  vector(512) not null
);

create table if not exists ledger (
  id                bigserial primary key,
  message_id        text not null,
  route             text not null,
  model             text not null,
  ok                boolean not null,
  prompt_tokens     int not null,
  completion_tokens int not null,
  micros            bigint not null
);
