-- Read the scheduler's shared secret only from a server-side service-role call.
-- The secret itself is created separately in Supabase Vault per environment.
create or replace function public.gsat_get_ingestion_cron_secret()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'gsat_validation_cron_secret'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.gsat_get_ingestion_cron_secret() from public, anon, authenticated;
grant execute on function public.gsat_get_ingestion_cron_secret() to service_role;
