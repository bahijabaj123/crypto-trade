package com.cryptotrade.backend.web;

import com.cryptotrade.backend.dto.BougieVue;
import com.cryptotrade.backend.dto.CarnetVue;
import com.cryptotrade.backend.dto.PrixVue;
import com.cryptotrade.backend.exception.PrixIndisponibleException;
import com.cryptotrade.backend.exception.RegleMetierException;
import com.cryptotrade.backend.service.BinanceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Objects;

/** Les prix du marche (via Binance). */
@RestController
@RequestMapping("/api/marche")
public class MarcheController {

    private final BinanceService binanceService;

    public MarcheController(BinanceService binanceService) {
        this.binanceService = binanceService;
    }

    /** /api/marche/bougies/BTCUSDT?intervalle=1h&limite=60 : chandeliers pour le graphique. */
    @GetMapping("/bougies/{symbole}")
    public List<BougieVue> bougies(@PathVariable String symbole,
                                   @RequestParam(defaultValue = "1h") String intervalle,
                                   @RequestParam(defaultValue = "60") int limite) {
        return binanceService.getBougies(symbole, intervalle, limite);
    }

    /** /api/marche/carnet/BTCUSDT?profondeur=10 : acheteurs et vendeurs du moment (Binance). */
    @GetMapping("/carnet/{symbole}")
    public CarnetVue carnet(@PathVariable String symbole, @RequestParam(defaultValue = "10") int profondeur) {
        return binanceService.getCarnet(symbole, profondeur);
    }

    /** /api/marche/prix/BTCUSDT */
    @GetMapping("/prix/{symbole}")
    public PrixVue prix(@PathVariable String symbole) {
        String s = symbole.trim().toUpperCase();
        return new PrixVue(s, binanceService.getPrix(s), binanceService.getVariation24h(s));
    }

    /**
     * /api/marche/prix?symboles=BTCUSDT,ETHUSDT,SOLUSDT (les symboles en erreur sont ignores).
     * Les symboles sont interroges en parallele : la reponse ne depend plus de la somme des delais.
     */
    @GetMapping("/prix")
    public List<PrixVue> prix(@RequestParam List<String> symboles) {
        return symboles.parallelStream()
                .map(symbole -> {
                    String s = symbole.trim().toUpperCase();
                    try {
                        return new PrixVue(s, binanceService.getPrix(s), binanceService.getVariation24h(s));
                    } catch (RegleMetierException | PrixIndisponibleException e) {
                        return null; // on passe au symbole suivant
                    }
                })
                .filter(Objects::nonNull)
                .toList();
    }
}
