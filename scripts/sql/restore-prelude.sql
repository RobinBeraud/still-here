-- Rôles et extensions attendus par un dump Supabase, recréés dans une base PostgreSQL vierge.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit;
create role supabase_auth_admin;
create role supabase_storage_admin;
create role supabase_admin;
create schema extensions;
create extension vector with schema extensions;
create extension pgcrypto with schema extensions;
