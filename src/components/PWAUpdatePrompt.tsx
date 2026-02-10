import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

export function PWAUpdatePrompt() {
  const hasPrompted = useRef(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Check for updates every 30 minutes
        setInterval(() => registration.update(), 30 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    if (needRefresh && !hasPrompted.current) {
      hasPrompted.current = true;
      toast("New version available", {
        description: "Tap to update IGU to the latest version.",
        duration: Infinity,
        action: {
          label: "Update",
          onClick: () => updateServiceWorker(true),
        },
      });
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
}
