package com.cryptotrade.backend.exception;

/** Une regle du metier n'est pas respectee (solde insuffisant, symbole inconnu...). Renvoyee en HTTP 400. */
public class RegleMetierException extends RuntimeException {

    public RegleMetierException(String message) {
        super(message);
    }
}
