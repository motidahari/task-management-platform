import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

/**
 * The whole app's user-visible text lives in one dictionary per language,
 * keyed at the top level by the component/store/composable/type that owns it.
 * Add a new language by dropping a sibling `<lang>.json` and registering it
 * in `resources` below.
 */
void i18next.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: en },
  },
  // React already escapes rendered output — double-escaping would corrupt entities.
  interpolation: { escapeValue: false },
});

export default i18next;
