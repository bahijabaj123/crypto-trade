package com.cryptotrade.backend.config;

import com.cryptotrade.backend.dto.ScenarioJeuDto;
import com.cryptotrade.backend.dto.ScenarioJeuDto.RequeteDto;
import com.cryptotrade.backend.service.ScenarioJeuService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Au premier demarrage (table vide), ajoute les scenarios de depart du jeu.
 * Ensuite c'est l'admin qui les gere depuis la page « Scenarios du jeu » : ce code ne remet jamais rien en place.
 */
@Component
public class InitialisationScenarios implements ApplicationRunner {

    private final ScenarioJeuService service;

    public InitialisationScenarios(ScenarioJeuService service) {
        this.service = service;
    }

    @Override
    public void run(ApplicationArguments args) {
        service.initialiserSiVide(List.of(
                new ScenarioJeuDto("covid-crypto",
                        "Le Krach du Covid-19 (Crypto)",
                        "Mars 2020. Le monde s'arrête. Le Bitcoin, l'Ethereum et les altcoins perdent plus de 50%.",
                        "Difficile", "🦠", "from-orange-500 to-red-500", "Crypto", true, 1,
                        List.of(new RequeteDto("binance", "BTCUSDT", "2020-03-01", "2020-03-20", "1h"), new RequeteDto("binance", "ETHUSDT", "2020-03-01", "2020-03-20", "1h"), new RequeteDto("binance", "BNBUSDT", "2020-03-01", "2020-03-20", "1h"), new RequeteDto("binance", "XRPUSDT", "2020-03-01", "2020-03-20", "1h"))),
                new ScenarioJeuDto("ukraine-2022",
                        "La Guerre en Ukraine (Crypto, 2022)",
                        "Février 2022. La Russie envahit l’Ukraine. Sanctions, panique sur les marchés : comment réagissent le Bitcoin et les cryptos ?",
                        "Difficile", "🪖", "from-blue-600 to-yellow-500", "Crypto", true, 2,
                        List.of(new RequeteDto("binance", "BTCUSDT", "2022-02-10", "2022-03-10", "1h"), new RequeteDto("binance", "ETHUSDT", "2022-02-10", "2022-03-10", "1h"), new RequeteDto("binance", "BNBUSDT", "2022-02-10", "2022-03-10", "1h"), new RequeteDto("binance", "XRPUSDT", "2022-02-10", "2022-03-10", "1h"))),
                new ScenarioJeuDto("bulle-2017-2018",
                        "L’Éclatement de la Bulle Crypto (2017-2018)",
                        "Décembre 2017. Le Bitcoin frôle 20 000 $ puis s’effondre de plus de 50 % en quelques semaines. Saurez-vous vendre au sommet ?",
                        "Difficile", "🫧", "from-yellow-500 to-red-600", "Crypto", true, 3,
                        List.of(new RequeteDto("binance", "BTCUSDT", "2017-12-20", "2018-01-30", "1h"), new RequeteDto("binance", "ETHUSDT", "2017-12-20", "2018-01-30", "1h"), new RequeteDto("binance", "BNBUSDT", "2017-12-20", "2018-01-30", "1h"), new RequeteDto("binance", "LTCUSDT", "2017-12-20", "2018-01-30", "1h"))),
                new ScenarioJeuDto("chine-2021",
                        "L’Interdiction du Minage en Chine (2021)",
                        "Mai 2021. Les tweets d’Elon Musk, puis la Chine qui interdit le minage : les cryptos perdent plus de 40 % en quelques jours.",
                        "Difficile", "⛏️", "from-red-600 to-rose-800", "Crypto", true, 4,
                        List.of(new RequeteDto("binance", "BTCUSDT", "2021-05-05", "2021-05-30", "1h"), new RequeteDto("binance", "ETHUSDT", "2021-05-05", "2021-05-30", "1h"), new RequeteDto("binance", "BNBUSDT", "2021-05-05", "2021-05-30", "1h"), new RequeteDto("binance", "DOGEUSDT", "2021-05-05", "2021-05-30", "1h"))),
                new ScenarioJeuDto("luna-2022",
                        "L’Effondrement de Terra Luna (2022)",
                        "Mai 2022. Le stablecoin UST perd sa parité avec le dollar et Luna s’effondre : la panique gagne tout le marché crypto.",
                        "Extrême", "🌙", "from-indigo-600 to-purple-800", "Crypto", true, 5,
                        List.of(new RequeteDto("binance", "BTCUSDT", "2022-05-01", "2022-05-20", "1h"), new RequeteDto("binance", "ETHUSDT", "2022-05-01", "2022-05-20", "1h"), new RequeteDto("binance", "BNBUSDT", "2022-05-01", "2022-05-20", "1h"), new RequeteDto("binance", "XRPUSDT", "2022-05-01", "2022-05-20", "1h"))),
                new ScenarioJeuDto("ftx-2022",
                        "La Faillite de FTX (2022)",
                        "Novembre 2022. La deuxième plateforme crypto du monde s’effondre en quelques jours. La confiance disparaît, comme lors de Mt. Gox.",
                        "Extrême", "🏦", "from-slate-600 to-blue-900", "Crypto", true, 6,
                        List.of(new RequeteDto("binance", "BTCUSDT", "2022-11-01", "2022-11-20", "1h"), new RequeteDto("binance", "ETHUSDT", "2022-11-01", "2022-11-20", "1h"), new RequeteDto("binance", "BNBUSDT", "2022-11-01", "2022-11-20", "1h"), new RequeteDto("binance", "SOLUSDT", "2022-11-01", "2022-11-20", "1h")))));
    }
}
