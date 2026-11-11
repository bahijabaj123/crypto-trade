/**
 * Adresse du service FastAPI (indépendant de Spring Boot).
 * Le conseiller IA n'appelle jamais http://localhost:8081/api.
 */
export const IA_API_URL = 'http://127.0.0.1:8000/api/ia';

/** Seul symbole et seul horizon acceptés par l'API V1. */
export const IA_SYMBOL = 'BTCUSDT';
export const IA_INTERVAL = '1h';
