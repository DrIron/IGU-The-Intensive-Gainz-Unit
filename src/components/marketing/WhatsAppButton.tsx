import { useSiteContent } from "@/hooks/useSiteContent";
import { MessageCircle } from "lucide-react";

export function WhatsAppButton() {
  const { data: cmsContent } = useSiteContent("homepage");

  // Get WhatsApp number from CMS
  const whatsappNumber = cmsContent?.contact?.whatsapp_number;
  const whatsappMessage = cmsContent?.contact?.whatsapp_message || "Hi! I'm interested in IGU coaching.";

  // Don't render if no WhatsApp number is configured
  if (!whatsappNumber) {
    return null;
  }

  // Build WhatsApp URL
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-24 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
      style={{ backgroundColor: "#25D366" }}
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle className="h-7 w-7 text-white" />
    </a>
  );
}
