alter table public.integration_links
  drop constraint if exists integration_links_provider_check;

alter table public.integration_links
  add constraint integration_links_provider_check
  check (provider in ('omie', 'rdstation'));

alter table public.sync_jobs
  drop constraint if exists sync_jobs_provider_check;

alter table public.sync_jobs
  add constraint sync_jobs_provider_check
  check (provider in ('omie', 'rdstation'));
