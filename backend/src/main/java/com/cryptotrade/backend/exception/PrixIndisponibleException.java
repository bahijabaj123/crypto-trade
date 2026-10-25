package com.cryptotrade.backend.exception;

/** Binance ne repond pas. Renvoyee en HTTP 503. */
public class PrixIndisponibleException extends RuntimeException {

    public PrixIndisponibleException(String message, Throwable cause) {
        super(message, cause);
    }

    public PrixIndisponibleException(String message) {
        super(message);
    }
}
