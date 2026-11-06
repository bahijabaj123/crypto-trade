package com.cryptotrade.backend.dto;

import java.time.LocalDateTime;

/** Format unique des erreurs renvoyees au frontend. */
public record ErreurApi(int status, String message, LocalDateTime horodatage) {
}
