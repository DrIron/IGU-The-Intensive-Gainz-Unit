import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Flip to true once ar/*.json is translated and an Arabic-capable
// font (Cairo / Readex Pro) is in the stack. Keeps i18n scaffolding intact.
const SHOW_ARABIC_TOGGLE = false;

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  if (!SHOW_ARABIC_TOGGLE) return null;

  const toggleLanguage = () => {
    const next = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(next);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleLanguage}
      aria-label={i18n.language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      title={i18n.language === 'ar' ? 'English' : 'العربية'}
    >
      <Globe className="h-4 w-4" />
    </Button>
  );
}
