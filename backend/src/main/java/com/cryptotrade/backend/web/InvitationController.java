package com.cryptotrade.backend.web;

import com.cryptotrade.backend.dto.InvitationDtos.InvitationReponse;
import com.cryptotrade.backend.dto.InvitationDtos.InvitationRequest;
import com.cryptotrade.backend.security.AuthContext;
import com.cryptotrade.backend.service.InvitationService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** POST /api/invitations : envoyer par email une invitation a une salle de jeu (jeton obligatoire). */
@RestController
@RequestMapping("/api/invitations")
public class InvitationController {

    private final InvitationService service;

    public InvitationController(InvitationService service) {
        this.service = service;
    }

    @PostMapping
    public InvitationReponse inviter(@RequestBody InvitationRequest req) {
        return service.inviter(AuthContext.courant().orElse(null), req);
    }
}
