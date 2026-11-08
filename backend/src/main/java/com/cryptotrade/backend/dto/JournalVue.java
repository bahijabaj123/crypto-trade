package com.cryptotrade.backend.dto;

import java.time.LocalDateTime;

public record JournalVue(Long id, LocalDateTime date, String acteur, String action, String details) {
}
