-- Optional source detail quality is distinct from listing-search coverage.
-- Summary-only feed refreshes must not overwrite previously fetched full text.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS description_quality text NOT NULL DEFAULT 'summary'
    CHECK (description_quality IN ('summary','full')),
  ADD COLUMN IF NOT EXISTS details_checked_at timestamptz;
