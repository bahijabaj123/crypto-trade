package com.cryptotrade.backend.dto;

/** Les formats echanges avec Angular pour inviter un joueur par email. */
public final class InvitationDtos {

    private InvitationDtos() {
    }

    /** Ce que le joueur envoie : l'email de l'ami + la salle. Le lien est fabrique par le serveur. */
    public record InvitationRequest(String email, String code, String hote, String scenario) {
    }

    public record InvitationReponse(String message) {
    }
}
