/**
 * Adresse du backend : localhost en développement, Render en ligne.
 * ➜ Remplace l'URL Render ci-dessous après l'étape 3 du déploiement.
 */
const EN_LOCAL = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

export const API_URL = EN_LOCAL
  ? 'http://localhost:8081'
  : 'https://crypto-trade-6efj.onrender.com';
