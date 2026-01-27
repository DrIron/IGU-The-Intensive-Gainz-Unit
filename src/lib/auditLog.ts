/**
 * Admin Audit Logging Utility
 * 
 * Logs all sensitive admin actions to the admin_audit_log table.
 * Used primarily for pricing and payout configuration changes.
 */

import { supabase } from "@/integrations/supabase/client";

export type AuditEntityType = 
  | 'service_pricing'
  | 'payout_rules'
  | 'addon_pricing'
  | 'addon_payout_rules'
  | 'addon_catalog'
  | 'billing_override'
  | 'subscription'
  | 'profile'
  | 'discount_code'
  | 'discount_code_grant';

export interface AuditLogEntry {
  action_type: string;
  target_type: AuditEntityType;
  target_id?: string;
  details?: Record<string, any>;
  before_json?: Record<string, any>;
  after_json?: Record<string, any>;
}

/**
 * Log an admin action to the audit log
 */
export async function logAuditAction(entry: AuditLogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn("Cannot log audit action: no authenticated user");
      return;
    }

    const { error } = await supabase
      .from("admin_audit_log")
      .insert({
        admin_user_id: user.id,
        action_type: entry.action_type,
        target_type: entry.target_type,
        target_id: entry.target_id || null,
        details: entry.details || null,
        before_json: entry.before_json || null,
        after_json: entry.after_json || null,
      });

    if (error) {
      console.error("Failed to log audit action:", error);
    }
  } catch (err) {
    console.error("Error logging audit action:", err);
  }
}

/**
 * Log a pricing change
 */
export async function logPricingChange(
  entityType: AuditEntityType,
  entityId: string,
  entityName: string,
  before: Record<string, any>,
  after: Record<string, any>
): Promise<void> {
  await logAuditAction({
    action_type: 'pricing_update',
    target_type: entityType,
    target_id: entityId,
    details: {
      entity_name: entityName,
      changed_fields: Object.keys(after).filter(k => before[k] !== after[k]),
    },
    before_json: before,
    after_json: after,
  });
}

/**
 * Log a payout rule change
 */
export async function logPayoutRuleChange(
  entityType: 'payout_rules' | 'addon_payout_rules',
  entityId: string,
  entityName: string,
  before: Record<string, any>,
  after: Record<string, any>
): Promise<void> {
  await logAuditAction({
    action_type: 'payout_rule_update',
    target_type: entityType,
    target_id: entityId,
    details: {
      entity_name: entityName,
      changed_fields: Object.keys(after).filter(k => before[k] !== after[k]),
    },
    before_json: before,
    after_json: after,
  });
}

/**
 * Log an addon catalog change
 */
export async function logAddonCatalogChange(
  entityId: string,
  entityName: string,
  before: Record<string, any>,
  after: Record<string, any>
): Promise<void> {
  await logAuditAction({
    action_type: 'addon_catalog_update',
    target_type: 'addon_catalog',
    target_id: entityId,
    details: {
      entity_name: entityName,
      changed_fields: Object.keys(after).filter(k => before[k] !== after[k]),
    },
    before_json: before,
    after_json: after,
  });
}

/**
 * Log a create action
 */
export async function logCreateAction(
  entityType: AuditEntityType,
  entityId: string,
  entityName: string,
  data: Record<string, any>
): Promise<void> {
  await logAuditAction({
    action_type: 'create',
    target_type: entityType,
    target_id: entityId,
    details: { entity_name: entityName },
    after_json: data,
  });
}
