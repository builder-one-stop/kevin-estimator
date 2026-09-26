import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en.json'
import es from '../locales/es.json'

const savedLanguage = (() => {
  try { return localStorage.getItem('os-lang') || 'en' } catch { return 'en' }
})()

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: savedLanguage === 'es' ? 'es' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

document.documentElement.lang = i18n.language

export async function setLanguage(language) {
  await i18n.changeLanguage(language)
  document.documentElement.lang = language
  try { localStorage.setItem('os-lang', language) } catch { /* storage may be unavailable */ }
  // TODO: also save this language in the Supabase user profile.
}

export default i18n
