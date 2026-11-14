create or replace function public.gsat_get_ingestion_cron_secret()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'vault'
as $function$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'gsat_validation_cron_secret'
  order by created_at desc
  limit 1;
$function$;

revoke all on function public.gsat_get_ingestion_cron_secret() from public, anon, authenticated;
grant execute on function public.gsat_get_ingestion_cron_secret() to service_role;

-- Vault values are provisioned per Supabase project, never committed to source.
-- Required names: gsat_validation_project_url, gsat_validation_publishable_key,
-- gsat_validation_cron_secret. Use production-specific names in a production project.
select cron.schedule(
  'gsat-ingest-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'gsat_validation_project_url'
      ) || '/functions/v1/gsat-ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'gsat_validation_publishable_key'
        ),
        'x-gsat-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'gsat_validation_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    ) as request_id;
  $job$
);
