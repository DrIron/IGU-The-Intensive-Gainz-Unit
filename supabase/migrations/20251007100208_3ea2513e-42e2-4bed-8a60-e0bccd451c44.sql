-- Add tap_charge_id column to subscriptions table to track TAP payment charges
ALTER TABLE public.subscriptions 
ADD COLUMN tap_charge_id text;