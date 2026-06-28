/**
 * P4 Editor v1 — context that lets deep board cards (MuscleSlotCard, SessionBlock) render the
 * amber "Customized" badge + per-element "Reset to template" without prop-drilling through
 * DayColumn/SessionBlock. Provided by MuscleBuilderPage only in client (assignment) mode; the
 * default value is inert, so the template board is unaffected.
 */
import { createContext, useContext } from "react";

export interface ClientEditorContextValue {
  clientMode: boolean;
  overriddenSlotIds: Set<string>;
  overriddenSessionIds: Set<string>;
  onResetSlot: (slotId: string) => void;
  onResetSession: (sessionId: string) => void;
}

const INERT: ClientEditorContextValue = {
  clientMode: false,
  overriddenSlotIds: new Set(),
  overriddenSessionIds: new Set(),
  onResetSlot: () => {},
  onResetSession: () => {},
};

const ClientEditorContext = createContext<ClientEditorContextValue>(INERT);

export const ClientEditorProvider = ClientEditorContext.Provider;

export function useClientEditor(): ClientEditorContextValue {
  return useContext(ClientEditorContext);
}
