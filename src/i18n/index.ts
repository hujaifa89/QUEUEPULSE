import { en, type TranslationKey } from './en';
import { bn } from './bn';

export type Locale = 'en' | 'bn';
export type { TranslationKey };

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en,
  bn,
};

export function t(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dictionary = dictionaries[locale] || dictionaries.en;
  let text = dictionary[key] || dictionaries.en[key] || key;

  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
    }
  }

  return text;
}
