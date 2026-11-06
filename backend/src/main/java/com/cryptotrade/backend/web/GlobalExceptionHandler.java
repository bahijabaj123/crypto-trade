package com.cryptotrade.backend.web;

import com.cryptotrade.backend.dto.ErreurApi;
import com.cryptotrade.backend.exception.PrixIndisponibleException;
import com.cryptotrade.backend.exception.RegleMetierException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.time.LocalDateTime;
import java.util.stream.Collectors;

/** Transforme les erreurs en reponses JSON propres : {"status":400,"message":"...","horodatage":"..."} */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RegleMetierException.class)
    public ResponseEntity<ErreurApi> regleMetier(RegleMetierException e) {
        return reponse(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    @ExceptionHandler(PrixIndisponibleException.class)
    public ResponseEntity<ErreurApi> prixIndisponible(PrixIndisponibleException e) {
        return reponse(HttpStatus.SERVICE_UNAVAILABLE,
                "Les prix du marche sont indisponibles pour le moment. Reessayez dans quelques secondes.");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErreurApi> validation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + " : " + f.getDefaultMessage())
                .collect(Collectors.joining(" ; "));
        return reponse(HttpStatus.BAD_REQUEST, message);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErreurApi> corpsIllisible(HttpMessageNotReadableException e) {
        return reponse(HttpStatus.BAD_REQUEST,
                "Requete invalide : verifiez le JSON et les valeurs de sens (ACHAT/VENTE) et type (MARKET...).");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErreurApi> parametreInvalide(MethodArgumentTypeMismatchException e) {
        return reponse(HttpStatus.BAD_REQUEST, "Parametre invalide : " + e.getName());
    }

    private ResponseEntity<ErreurApi> reponse(HttpStatus statut, String message) {
        return ResponseEntity.status(statut)
                .body(new ErreurApi(statut.value(), message, LocalDateTime.now()));
    }
}
