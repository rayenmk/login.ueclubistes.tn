-- ============================================================
-- UE CLUBISTE - MODULE MATCHS / PLACEMENT
-- Football / Handball / Basketball
-- ============================================================

ALTER TABLE public.subscribers
ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.subscribers
DROP CONSTRAINT IF EXISTS subscribers_gender_check;

ALTER TABLE public.subscribers
ADD CONSTRAINT subscribers_gender_check
CHECK (gender IN ('MALE', 'FEMALE'));

CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport text NOT NULL CHECK (sport IN ('FOOTBALL', 'HANDBALL', 'BASKETBALL')),
  home_team text NOT NULL DEFAULT 'Club Africain',
  away_team text NOT NULL,
  home_logo_url text,
  away_logo_url text,
  competition text,
  stadium text,
  match_date date NOT NULL,
  match_time time,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS home_logo_url text;

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS away_logo_url text;

CREATE TABLE IF NOT EXISTS public.match_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  zone_key text NOT NULL CHECK (zone_key IN ('PELOUSE', 'ENCEINTE_INF', 'ENCEINTE_SUP', 'VIRAGE_1', 'VIRAGE_2')),
  zone_name text NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity >= 0),
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, zone_key)
);

CREATE TABLE IF NOT EXISTS public.match_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  subscriber_id uuid NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.match_zones(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_date ON public.matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_sport ON public.matches(sport);
CREATE INDEX IF NOT EXISTS idx_match_zones_match ON public.match_zones(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participations_match ON public.match_participations(match_id);
CREATE INDEX IF NOT EXISTS idx_match_participations_subscriber ON public.match_participations(subscriber_id);

CREATE OR REPLACE FUNCTION public.uec_match_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_updated_at ON public.matches;
CREATE TRIGGER matches_updated_at
BEFORE UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.uec_match_updated_at();

DROP TRIGGER IF EXISTS match_zones_updated_at ON public.match_zones;
CREATE TRIGGER match_zones_updated_at
BEFORE UPDATE ON public.match_zones
FOR EACH ROW EXECUTE FUNCTION public.uec_match_updated_at();

DROP TRIGGER IF EXISTS match_participations_updated_at ON public.match_participations;
CREATE TRIGGER match_participations_updated_at
BEFORE UPDATE ON public.match_participations
FOR EACH ROW EXECUTE FUNCTION public.uec_match_updated_at();

CREATE OR REPLACE FUNCTION public.create_default_match_zones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.match_zones(match_id, zone_key, zone_name)
  VALUES
    (NEW.id, 'PELOUSE', 'Pelouse'),
    (NEW.id, 'ENCEINTE_INF', 'Enceinte inférieure'),
    (NEW.id, 'ENCEINTE_SUP', 'Enceinte supérieure'),
    (NEW.id, 'VIRAGE_1', 'Virage 1'),
    (NEW.id, 'VIRAGE_2', 'Virage 2')
  ON CONFLICT (match_id, zone_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matches_default_zones ON public.matches;
CREATE TRIGGER matches_default_zones
AFTER INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.create_default_match_zones();

-- Backfill for matches created before this migration.
INSERT INTO public.match_zones(match_id, zone_key, zone_name)
SELECT m.id, z.zone_key, z.zone_name
FROM public.matches m
CROSS JOIN (
  VALUES
    ('PELOUSE', 'Pelouse'),
    ('ENCEINTE_INF', 'Enceinte inférieure'),
    ('ENCEINTE_SUP', 'Enceinte supérieure'),
    ('VIRAGE_1', 'Virage 1'),
    ('VIRAGE_2', 'Virage 2')
) AS z(zone_key, zone_name)
ON CONFLICT (match_id, zone_key) DO NOTHING;

-- ============================================================
-- SECURITY FUNCTION
-- Une femme ne peut jamais choisir VIRAGE_1 / VIRAGE_2.
-- La règle est appliquée côté DB, pas seulement côté JavaScript.
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_choose_match_zone(
  p_match_id uuid,
  p_zone_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscriber_id uuid;
  v_gender text;
  v_zone_key text;
  v_available boolean;
  v_capacity integer;
  v_current_count integer;
BEGIN
  SELECT s.id, s.gender
  INTO v_subscriber_id, v_gender
  FROM public.subscribers s
  WHERE s.user_id = auth.uid()
    AND s.status = 'ACTIVE'
  LIMIT 1;

  IF v_subscriber_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_gender IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
      AND m.is_active = true
  ) THEN
    RETURN false;
  END IF;

  SELECT mz.zone_key, mz.is_available, mz.capacity
  INTO v_zone_key, v_available, v_capacity
  FROM public.match_zones mz
  WHERE mz.id = p_zone_id
    AND mz.match_id = p_match_id;

  IF v_zone_key IS NULL OR v_available = false THEN
    RETURN false;
  END IF;

  IF v_gender = 'FEMALE'
     AND v_zone_key IN ('VIRAGE_1', 'VIRAGE_2') THEN
    RETURN false;
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT count(*)::integer
    INTO v_current_count
    FROM public.match_participations mp
    WHERE mp.match_id = p_match_id
      AND mp.zone_id = p_zone_id
      AND mp.subscriber_id <> v_subscriber_id;

    IF v_current_count >= v_capacity THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.can_choose_match_zone(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_choose_match_zone(uuid, uuid) TO authenticated;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS matches_select_authenticated ON public.matches;
CREATE POLICY matches_select_authenticated
ON public.matches FOR SELECT TO authenticated
USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS matches_admin_insert ON public.matches;
CREATE POLICY matches_admin_insert
ON public.matches FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS matches_admin_update ON public.matches;
CREATE POLICY matches_admin_update
ON public.matches FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS matches_admin_delete ON public.matches;
CREATE POLICY matches_admin_delete
ON public.matches FOR DELETE TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS match_zones_select_authenticated ON public.match_zones;
CREATE POLICY match_zones_select_authenticated
ON public.match_zones FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_zones.match_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS match_zones_admin_insert ON public.match_zones;
CREATE POLICY match_zones_admin_insert
ON public.match_zones FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS match_zones_admin_update ON public.match_zones;
CREATE POLICY match_zones_admin_update
ON public.match_zones FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS match_zones_admin_delete ON public.match_zones;
CREATE POLICY match_zones_admin_delete
ON public.match_zones FOR DELETE TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS match_participations_select ON public.match_participations;
CREATE POLICY match_participations_select
ON public.match_participations FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR subscriber_id IN (
    SELECT s.id FROM public.subscribers s WHERE s.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS match_participations_insert ON public.match_participations;
CREATE POLICY match_participations_insert
ON public.match_participations FOR INSERT TO authenticated
WITH CHECK (
  subscriber_id IN (
    SELECT s.id FROM public.subscribers s
    WHERE s.user_id = auth.uid()
      AND s.status = 'ACTIVE'
  )
  AND public.can_choose_match_zone(match_id, zone_id)
);

DROP POLICY IF EXISTS match_participations_update ON public.match_participations;
CREATE POLICY match_participations_update
ON public.match_participations FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR subscriber_id IN (
    SELECT s.id FROM public.subscribers s WHERE s.user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    subscriber_id IN (
      SELECT s.id FROM public.subscribers s
      WHERE s.user_id = auth.uid()
        AND s.status = 'ACTIVE'
    )
    AND public.can_choose_match_zone(match_id, zone_id)
  )
);

DROP POLICY IF EXISTS match_participations_delete ON public.match_participations;
CREATE POLICY match_participations_delete
ON public.match_participations FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR subscriber_id IN (
    SELECT s.id FROM public.subscribers s WHERE s.user_id = auth.uid()
  )
);

GRANT SELECT ON public.matches, public.match_zones, public.match_participations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.matches, public.match_zones, public.match_participations TO authenticated;

-- ============================================================
-- STORAGE DES LOGOS D'EQUIPES
-- A executer dans Supabase SQL Editor avec les privileges du projet.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('match-logos', 'match-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS match_logos_public_read ON storage.objects;
CREATE POLICY match_logos_public_read
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'match-logos');

DROP POLICY IF EXISTS match_logos_authenticated_insert ON storage.objects;
CREATE POLICY match_logos_authenticated_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'match-logos');

DROP POLICY IF EXISTS match_logos_authenticated_update ON storage.objects;
CREATE POLICY match_logos_authenticated_update
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'match-logos')
WITH CHECK (bucket_id = 'match-logos');

DROP POLICY IF EXISTS match_logos_authenticated_delete ON storage.objects;
CREATE POLICY match_logos_authenticated_delete
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'match-logos');

-- Important: this script assumes your existing public.is_admin() function.
-- If your existing project uses another admin helper, replace public.is_admin().
