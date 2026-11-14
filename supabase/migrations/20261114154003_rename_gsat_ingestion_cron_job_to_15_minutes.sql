select cron.unschedule('gsat-ingest-every-minute');

select cron.schedule(
  'gsat-ingest-every-15-minutes',
  '*/15 * * * *',
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
