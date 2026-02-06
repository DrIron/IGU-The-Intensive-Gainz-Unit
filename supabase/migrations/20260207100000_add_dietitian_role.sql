-- ============================================================
-- Migration: Add Dietitian Enum Values
-- Phase 22: IGU Nutrition System Enhancement
--
-- NOTE: This migration ONLY adds enum values.
-- Functions/tables using 'dietitian' are in the next migration
-- because PostgreSQL requires enum additions to commit first.
-- ============================================================

-- Extend app_role enum with 'dietitian'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dietitian';

-- Extend staff_specialty enum with 'dietitian'
ALTER TYPE public.staff_specialty ADD VALUE IF NOT EXISTS 'dietitian';
