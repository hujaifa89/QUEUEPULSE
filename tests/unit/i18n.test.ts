import { t, dictionaries } from '@/i18n';

describe('i18n dictionaries and t() helper', () => {
  it('has identical keys in English and Bengali dictionaries', () => {
    const enKeys = Object.keys(dictionaries.en).sort();
    const bnKeys = Object.keys(dictionaries.bn).sort();
    expect(enKeys).toEqual(bnKeys);
  });

  it('translates simple keys in English and Bengali', () => {
    expect(t('en', 'app_name')).toBe('QueuePulse');
    expect(t('bn', 'app_name')).toBe('কিউপালস');
    expect(t('en', 'status_serving')).toBe('Your turn');
    expect(t('bn', 'status_serving')).toBe('আপনার পালা');
  });

  it('interpolates parameters correctly', () => {
    expect(t('en', 'about_minutes', { count: 15 })).toBe('about 15 minutes');
    expect(t('bn', 'about_minutes', { count: 15 })).toBe('প্রায় 15 মিনিট');
  });
});
