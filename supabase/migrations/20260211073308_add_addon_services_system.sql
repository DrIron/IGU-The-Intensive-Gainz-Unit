-- Migration 3: Add-on Services System

-- ============================================================
-- 1. TABLES
-- ============================================================

CREATE TABLE addon_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type addon_service_type NOT NULL,
  base_price_kwd NUMERIC(8,2) NOT NULL,
  pack_size INTEGER,
  pack_price_kwd NUMERIC(8,2),
  pack_expiry_months INTEGER DEFAULT 3,
  professional_payout_kwd NUMERIC(8,2) NOT NULL DEFAULT 0,
  igu_take_kwd NUMERIC(8,2) NOT NULL DEFAULT 0,
  tier_restrictions TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE addon_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addon_service_id UUID NOT NULL REFERENCES addon_services(id) ON DELETE RESTRICT,
  professional_id UUID REFERENCES auth.users(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  total_paid_kwd NUMERIC(8,2) NOT NULL,
  discount_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  sessions_remaining INTEGER,
  expires_at TIMESTAMPTZ,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE addon_session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_purchase_id UUID NOT NULL REFERENCES addon_purchases(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES auth.users(id),
  session_date DATE NOT NULL,
  notes TEXT,
  professional_payout_kwd NUMERIC(8,2) NOT NULL,
  igu_take_kwd NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX idx_addon_purchases_client ON addon_purchases(client_id);
CREATE INDEX idx_addon_purchases_service ON addon_purchases(addon_service_id);
CREATE INDEX idx_addon_session_logs_purchase ON addon_session_logs(addon_purchase_id);
CREATE INDEX idx_addon_session_logs_professional ON addon_session_logs(professional_id);

-- ============================================================
-- 3. SEED DATA
-- ============================================================

-- Session packs (in-person sessions)
INSERT INTO addon_services (name, type, base_price_kwd, pack_size, pack_price_kwd, pack_expiry_months, professional_payout_kwd, igu_take_kwd) VALUES
  ('Single In-Person Session', 'session_pack', 15, 1, NULL, 3, 0, 0),
  ('4-Pack In-Person Sessions', 'session_pack', 12, 4, 48, 3, 0, 0),
  ('8-Pack In-Person Sessions', 'session_pack', 10, 8, 80, 3, 0, 0);

-- Specialist services (single + 4-pack)
INSERT INTO addon_services (name, type, base_price_kwd, pack_size, pack_price_kwd, pack_expiry_months, professional_payout_kwd, igu_take_kwd) VALUES
  ('Sports Psychologist Session', 'specialist', 20, 1, NULL, 3, 14, 6),
  ('Sports Psychologist 4-Pack', 'specialist', 18, 4, 72, 3, 12.6, 5.4),
  ('Physiotherapist Session', 'specialist', 18, 1, NULL, 3, 12, 6),
  ('Physiotherapist 4-Pack', 'specialist', 16.2, 4, 64.8, 3, 10.8, 5.4),
  ('Posing Coach Session', 'specialist', 15, 1, NULL, 3, 10, 5),
  ('Posing Coach 4-Pack', 'specialist', 13.5, 4, 54, 3, 9, 4.5);

-- One-time services
INSERT INTO addon_services (name, type, base_price_kwd, professional_payout_kwd, igu_take_kwd) VALUES
  ('Initial Consultation', 'one_time', 10, 6, 4),
  ('Photo/Video Shoot Coordination', 'one_time', 20, 0, 20);

-- Monthly add-on
INSERT INTO addon_services (name, type, base_price_kwd, professional_payout_kwd, igu_take_kwd, tier_restrictions) VALUES
  ('Competition Prep Add-On', 'monthly_addon', 50, 35, 15, ARRAY['complete', 'hybrid', 'in_person']);

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE addon_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_active_addon_services" ON addon_services
  FOR SELECT USING (is_active = true);

CREATE POLICY "admin_full_addon_services" ON addon_services
  FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "client_read_own_addon_purchases" ON addon_purchases
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "admin_full_addon_purchases" ON addon_purchases
  FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "client_read_own_addon_session_logs" ON addon_session_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM addon_purchases ap
      WHERE ap.id = addon_session_logs.addon_purchase_id
      AND ap.client_id = auth.uid()
    )
  );

CREATE POLICY "admin_full_addon_session_logs" ON addon_session_logs
  FOR ALL USING (public.is_admin(auth.uid()));
