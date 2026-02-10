import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enCommon from './locales/en/common.json';
import enNav from './locales/en/nav.json';
import arCommon from './locales/ar/common.json';
import arNav from './locales/ar/nav.json';

export const supportedLanguages = ['en', 'ar'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const rtlLanguages: SupportedLanguage[] = ['ar'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, nav: enNav },
      ar: { common: arCommon, nav: arNav },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'igu_language',
    },
  });

const updateDocumentDirection = (lng: string) => {
  const isRTL = rtlLanguages.includes(lng as SupportedLanguage);
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
};

i18n.on('languageChanged', updateDocumentDirection);
updateDocumentDirection(i18n.language);

export default i18n;
