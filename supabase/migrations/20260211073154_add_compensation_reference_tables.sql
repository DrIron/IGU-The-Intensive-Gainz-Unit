-- Migration 1: Compensation Reference Tables
-- Creates enums and lookup tables for the hourly-rate-based compensation model

-- ============================================================
-- 1. ENUMS
-- ============================================================

CREATE TYPE professional_role AS ENUM ('coach', 'dietitian');
CREATE TYPE professional_level AS ENUM ('junior', 'senior', 'lead');
CREATE TYPE work_type_category AS ENUM ('online', 'in_person');
CREATE TYPE addon_service_type AS ENUM ('session_pack', 'specialist', 'one_time', 'monthly_addon');

-- ============================================================
-- 2. TABLES
-- ============================================================

CREATE TABLE professional_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role professional_role NOT NULL,
  level professional_level NOT NULL,
  work_type work_type_category NOT NULL,
  hourly_rate_kwd NUMERIC(8,2) NOT NULL,
  requirements TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, level, work_type)
);

CREATE TABLE service_hour_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  role professional_role NOT NULL,
  work_type work_type_category NOT NULL,
  estimated_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, role, work_type)
);

CREATE TABLE igu_operations_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  payment_processing_kwd NUMERIC(8,2) NOT NULL DEFAULT 0,
  platform_cost_kwd NUMERIC(8,2) NOT NULL DEFAULT 0,
  admin_overhead_kwd NUMERIC(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id)
);

-- ============================================================
-- 3. SEED DATA
-- ============================================================

INSERT INTO professional_levels (role, level, work_type, hourly_rate_kwd, requirements) VALUES
  ('coach', 'junior', 'online',    4,  'Certified PT, <2 years coaching experience'),
  ('coach', 'junior', 'in_person', 8,  'Certified PT, <2 years coaching experience'),
  ('coach', 'senior', 'online',    6,  '3+ years experience, proven client results, specialty certs'),
  ('coach', 'senior', 'in_person', 12, '3+ years experience, proven client results, specialty certs'),
  ('coach', 'lead',   'online',    8,  '5+ years experience, advanced credentials (sports science degree, CSCS, etc.), mentors other coaches'),
  ('coach', 'lead',   'in_person', 15, '5+ years experience, advanced credentials (sports science degree, CSCS, etc.), mentors other coaches'),
  ('dietitian', 'junior', 'online', 5, 'Licensed dietitian, BSc Nutrition, <2 years sports nutrition experience'),
  ('dietitian', 'senior', 'online', 7, '3+ years experience, sports nutrition specialty certification'),
  ('dietitian', 'lead',   'online', 9, '5+ years experience, MSc/PhD in nutrition, clinical sports nutrition background');

INSERT INTO service_hour_estimates (service_id, role, work_type, estimated_hours) VALUES
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 'coach', 'online', 5),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'coach', 'online', 5.5),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'coach', 'in_person', 4),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 'dietitian', 'online', 4),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'coach', 'online', 5.5),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'coach', 'in_person', 8),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 'dietitian', 'online', 4);

INSERT INTO igu_operations_costs (service_id, payment_processing_kwd, platform_cost_kwd, admin_overhead_kwd) VALUES
  ('4e842175-4e03-4170-8896-d90bf8cf6ca3', 0.4, 1.6, 0),
  ('2f2a81a8-f9fa-40f6-a2df-aa383796e3b9', 0.4, 1.6, 0),
  ('5edcae66-284c-482f-becd-f7bf28c3ff1e', 1.2, 1.8, 0),
  ('82a7d8b3-d592-45c7-9268-89f947d475a8', 4.5, 3.5, 0),
  ('0583d990-3c96-48b7-86f2-8bc87344791d', 7.5, 4.5, 0);

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE professional_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_hour_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE igu_operations_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_professional_levels" ON professional_levels
  FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "admin_full_service_hour_estimates" ON service_hour_estimates
  FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "admin_full_igu_operations_costs" ON igu_operations_costs
  FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "authenticated_read_professional_levels" ON professional_levels
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_service_hour_estimates" ON service_hour_estimates
  FOR SELECT USING (auth.role() = 'authenticated');
