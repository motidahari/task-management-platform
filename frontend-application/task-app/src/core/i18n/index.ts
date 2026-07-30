import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { buildLocaleResources, type LocaleDictionary } from './localeResources';

/**
 * Collects every co-located `locales/en.json` file at build time and merges
 * them into one resource tree — moving a component moves its text with it,
 * nothing to register centrally.
 */
const localeModules = import.meta.glob<{ default: LocaleDictionary }>('/src/**/locales/en.json', {
  eager: true,
});

const dictionariesByPath: Record<string, LocaleDictionary> = Object.fromEntries(
  Object.entries(localeModules).map(([path, dictionaryModule]) => [path, dictionaryModule.default]),
);

void i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: buildLocaleResources(dictionariesByPath) },
  },
  // React already escapes rendered output — double-escaping would corrupt entities.
  interpolation: { escapeValue: false },
});

export default i18next;
