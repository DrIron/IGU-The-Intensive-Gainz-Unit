import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect, useRef } from "react";

/**
 * Silent service-worker registration.
 *
 * Historical note: this component used to toast "New version available"
 * on every deploy and poll the registration every 30 minutes. That made
 * iterating on the app painful — every push (and there were many) woke
 * up the user with a popup. The vite-plugin-pwa `registerType: "autoUpdate"`
 * in `vite.config.ts` now handles activation silently on next navigation.
 *
 * We keep the component (and its mount in App.tsx) so we have a single
 * place to wire back in opt-in upgrade messaging — or a release-note
 * banner — without having to re-register the SW plumbing.
 */
export function PWAUpdatePrompt() {
  const registered = useRef(false);

  const {
    needRefresh: [needRefresh],
  } = useRegisterSW({
    onRegisteredSW() {
      // No periodic update check. The default vite-plugin-pwa behaviour
      // (update on tab re-focus + on navigation) is enough; an explicit
      // setInterval was firing every 30 minutes in the background and
      // creating update prompts while the coach was mid-session.
      registered.current = true;
    },
  });

  // If a future update flow needs to surface something to the user, hook
  // into `needRefresh` here. Kept empty on purpose for now.
  useEffect(() => {
    if (needRefresh && registered.current) {
      // Intentionally silent — autoUpdate will activate the new SW on
      // the next navigation. Add telemetry or a subtle banner here if
      // we later decide the user should know.
    }
  }, [needRefresh]);

  return null;
}
