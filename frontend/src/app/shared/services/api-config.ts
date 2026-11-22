/**
 * Adresse du backend Spring Boot.
 * Si ton backend tourne sur un autre port (ex. 8081), change UNIQUEMENT cette ligne.
 */

import { API_URL as BACKEND_URL } from '../../core/api.config';

export const API_URL = `${BACKEND_URL}/api`;
