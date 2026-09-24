-- Final legal documents add separately evidenced Terms acceptance and elder personal-data consent.
-- PostgreSQL requires enum additions to commit before they are used by policies/functions,
-- so dependent objects are updated in the following migration.
alter type public.consent_type add value if not exists 'terms_required';
alter type public.consent_type add value if not exists 'elder_privacy_required';
