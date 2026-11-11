import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { Observable, Subject, throwError } from 'rxjs';

import {
  ContributionXai,
  EtatIa,
  PredictResponse,
  PredictionBloc,
  XaiResponse,
} from '../../models/ia.models';
import { CryptoApiService } from '../../services/crypto-api.service';
import { IaApiService } from '../../services/ia-api.service';
import { AiAdvisorPanelComponent } from './ai-advisor-panel.component';

const AVIS_TEST = 'Réponse SYNTHÉTIQUE de test Angular : ne pas confondre avec le modèle réel.';

/** Cinq contributions dans l'ordre API, plus une sixième qui ne doit pas s'afficher. */
const CONTRIBUTIONS_TEST: ContributionXai[] = [
  contrib(1, 'ret_1h_lag1', 'TEST SHAP 1 rendement h-1', 'TEST −0,49 %', 0.010423750993062676),
  contrib(2, 'ret_1h', 'TEST SHAP 2 dernière heure', 'TEST +0,08 %', -0.010278899445096816),
  contrib(3, 'taker_buy_ratio', 'TEST SHAP 3 achats agressifs', 'TEST 47,05 %', 0.007168882373129217),
  contrib(4, 'ret_6h', 'TEST SHAP 4 rendement 6 h', 'TEST +0,03 %', -0.0050788809437626444),
  contrib(5, 'ret_24h', 'TEST SHAP 5 rendement 24 h', 'TEST -0,98 %', 0.0037993296424115304),
  contrib(6, 'rsi_14', 'TEST SHAP 6 ne doit pas s’afficher', 'TEST 47,5', 0.003314491416545989),
];

describe('AiAdvisorPanelComponent', () => {
  let fixture: ComponentFixture<AiAdvisorPanelComponent>;
  let component: AiAdvisorPanelComponent;
  let predict: jasmine.Spy<(explain: boolean) => Observable<PredictResponse>>;

  beforeEach(async () => {
    predict = jasmine.createSpy('predict');
    await TestBed.configureTestingModule({
      imports: [AiAdvisorPanelComponent],
      providers: [
        {
          provide: IaApiService,
          useValue: {
            predict,
            health: jasmine.createSpy('health'),
            modelInfo: jasmine.createSpy('modelInfo'),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('affiche le chargement sans inventer de prédiction', () => {
    const attente = new Subject<PredictResponse>();
    predict.and.returnValue(attente.asObservable());
    creer();

    const page = texte();
    expect(page).toContain('Chargement de la prédiction BTCUSDT 1 h');
    expect(component.payload()).toBeNull();
    expect(component.erreur()).toBeNull();
    expect(page).not.toContain('HAUSSE');
    expect(page).not.toContain('BAISSE');
    expect(page).not.toContain('ATTENDRE');
    expect(page).not.toContain('% de hausse');
    expect(page).not.toContain('Contributions TreeSHAP');
    expect(predict).toHaveBeenCalledOnceWith(true);
  });

  it('affiche HAUSSE pour une réponse synthétique de test', () => {
    const reponse = payloadTest({ state: 'HAUSSE', probabilityUp: 0.72 });
    predict.and.returnValue(ofSync(reponse));
    creer();

    expect(texte()).toContain('HAUSSE');
    expect(texte()).toContain(AVIS_TEST);
    expect(component.payload()?.prediction.state).toBe('HAUSSE');
    expect(component.payload()?.explication?.data_origin).toBe('synthetique');
  });

  it('affiche BAISSE pour une réponse synthétique de test', () => {
    const reponse = payloadTest({ state: 'BAISSE', probabilityUp: 0.31 });
    predict.and.returnValue(ofSync(reponse));
    creer();

    expect(texte()).toContain('BAISSE');
    expect(component.payload()?.prediction.state).toBe('BAISSE');
    expect(component.payload()?.prediction.probability_up).toBe(0.31);
  });

  it('affiche ATTENDRE pour une réponse synthétique de test', () => {
    const reponse = payloadTest({ state: 'ATTENDRE', probabilityUp: 0.5097145965171473 });
    predict.and.returnValue(ofSync(reponse));
    creer();

    expect(texte()).toContain('ATTENDRE');
    expect(component.payload()?.prediction.state).toBe('ATTENDRE');
  });

  it('affiche la probabilité API convertie en pourcentage, sans la modifier', () => {
    const probabilityUp = 0.7333333333333333;
    predict.and.returnValue(ofSync(payloadTest({ state: 'HAUSSE', probabilityUp })));
    creer();

    expect(component.payload()?.prediction.probability_up).toBe(probabilityUp);
    expect(component.formatPct(probabilityUp)).toBe(
      new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(
        probabilityUp * 100,
      ),
    );
    expect(texte()).toContain(`${component.formatPct(probabilityUp)} %`);
    expect(texte()).toContain('de hausse');
  });

  it('affiche exactement les cinq contributions SHAP de la réponse, sans recalcul', () => {
    const reponse = payloadTest({ state: 'ATTENDRE', probabilityUp: 0.51 });
    predict.and.returnValue(ofSync(reponse));
    creer();

    const page = texte();
    const attendues = CONTRIBUTIONS_TEST.slice(0, 5);
    expect(component.topContributions().map((ligne) => ligne.feature)).toEqual(
      attendues.map((ligne) => ligne.feature),
    );
    for (const ligne of attendues) {
      expect(component.topContributions().find((item) => item.feature === ligne.feature)?.contribution).toBe(
        ligne.contribution,
      );
      expect(page).toContain(ligne.label_fr);
      expect(page).toContain(ligne.value_display);
      expect(page).toContain(component.formatPoints(ligne.contribution));
    }
    expect(page).not.toContain('TEST SHAP 6');
    expect(component.payload()?.explication?.explanation.contributions[5].contribution).toBe(
      CONTRIBUTIONS_TEST[5].contribution,
    );
  });

  it('refuse les barres SHAP si l’état predict-1.0 et xai-1.0 diffèrent', () => {
    const reponse = payloadIncoherent({ statePredite: 'HAUSSE', stateExpliquee: 'BAISSE', pPredite: 0.72, pExpliquee: 0.72 });
    predict.and.returnValue(ofSync(reponse));
    creer();

    expect(component.shapOk()).toBeFalse();
    expect(texte()).toContain("L'explication n'est pas affichée");
    expect(texte()).not.toContain('Contributions TreeSHAP');
    expect(texte()).not.toContain('TEST SHAP 1');
  });

  it('refuse les barres SHAP si la probabilité predict-1.0 et xai-1.0 diffèrent', () => {
    const reponse = payloadIncoherent({
      statePredite: 'ATTENDRE',
      stateExpliquee: 'ATTENDRE',
      pPredite: 0.51,
      pExpliquee: 0.62,
    });
    predict.and.returnValue(ofSync(reponse));
    creer();

    expect(component.shapOk()).toBeFalse();
    expect(texte()).toContain("n'est pas cohérente avec la prédiction");
    expect(texte()).not.toContain('Contributions TreeSHAP');
  });

  it('affiche les dates UTC et valid_until_utc', () => {
    const candle = '2026-11-11T09:00:00.000Z';
    const decision = '2026-11-11T10:00:00.000Z';
    const validite = '2026-11-11T11:00:00.000Z';
    predict.and.returnValue(
      ofSync(
        payloadTest({
          state: 'ATTENDRE',
          probabilityUp: 0.51,
          candle,
          decision,
          validite,
        }),
      ),
    );
    creer();

    const page = texte();
    expect(page).toContain('Bougie close');
    expect(page).toContain('Décision');
    expect(page).toContain('Valable jusqu\'à');
    expect(page).toContain(component.formatUtc(candle));
    expect(page).toContain(component.formatUtc(decision));
    expect(page).toContain(component.formatUtc(validite));
    expect(component.formatUtc(validite)).toContain('UTC');
  });

  it('signale une prédiction déjà périmée et ne la présente pas comme un signal actuel', () => {
    predict.and.returnValue(
      ofSync(
        payloadTest({
          state: 'HAUSSE',
          probabilityUp: 0.72,
          validite: '2020-01-01T00:00:00.000Z',
        }),
      ),
    );
    creer();

    const page = texte();
    expect(component.perimee()).toBeTrue();
    expect(page).toContain('PÉRIMÉ');
    expect(page).toContain("n'est plus un signal actuel");
    expect(page).toContain('Dernier état enregistré : HAUSSE');
    expect(page).toContain('de hausse au moment de la décision');
    expect(component.classeBadge('HAUSSE')).toContain('text-crypto-green');
  });

  it('passe à PÉRIMÉE quand le temps local dépasse valid_until_utc, sans nouvel appel HTTP', fakeAsync(() => {
    let maintenant = Date.parse('2026-11-11T10:59:59.000Z');
    spyOn(Date, 'now').and.callFake(() => maintenant);
    predict.and.returnValue(
      ofSync(
        payloadTest({
          state: 'HAUSSE',
          probabilityUp: 0.72,
          validite: '2026-11-11T11:00:00.000Z',
        }),
      ),
    );
    creer();

    expect(component.perimee()).toBeFalse();
    expect(texte()).toContain('HAUSSE');
    expect(texte()).not.toContain('PÉRIMÉ');
    expect(predict).toHaveBeenCalledTimes(1);

    maintenant = Date.parse('2026-11-11T11:00:00.000Z');
    tick(1000);
    fixture.detectChanges();

    expect(component.perimee()).toBeTrue();
    expect(texte()).toContain('PÉRIMÉ');
    expect(texte()).toContain("n'est plus un signal actuel");
    expect(predict).toHaveBeenCalledTimes(1);
    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('affiche Serveur IA indisponible si FastAPI est arrêté', () => {
    predict.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 0,
            statusText: 'Unknown Error',
            url: 'http://127.0.0.1:8000/api/ia/predict',
          }),
      ),
    );
    creer();

    expect(texte()).toContain('Serveur IA indisponible');
    expect(component.payload()).toBeNull();
    expect(texte()).not.toContain('% de hausse');
  });

  it('affiche Modèle indisponible pour une erreur 503', () => {
    predict.and.returnValue(throwHttp(503, 'MODELE_INDISPONIBLE', 'TEST : modèle absent.'));
    creer();

    expect(texte()).toContain('Modèle indisponible');
    expect(texte()).toContain('TEST : modèle absent.');
    expect(component.payload()).toBeNull();
  });

  it('affiche Marché indisponible si Binance ne répond pas', () => {
    predict.and.returnValue(throwHttp(502, 'MARCHE_INDISPONIBLE', 'TEST : Binance indisponible.'));
    creer();

    expect(texte()).toContain('Marché indisponible');
    expect(texte()).toContain('TEST : Binance indisponible.');
    expect(component.payload()).toBeNull();
  });

  it('affiche Explication incohérente pour une erreur XAI', () => {
    predict.and.returnValue(throwHttp(500, 'EXPLICATION_INCOHERENTE', 'TEST : additivité TreeSHAP invalide.'));
    creer();

    expect(texte()).toContain('Explication incohérente');
    expect(texte()).toContain('TEST : additivité TreeSHAP invalide.');
    expect(component.payload()).toBeNull();
  });

  it('rappelle predict au clic sur Actualiser, sans polling réseau', fakeAsync(() => {
    const premier = new Subject<PredictResponse>();
    const second = new Subject<PredictResponse>();
    predict.and.returnValues(premier.asObservable(), second.asObservable());
    creer();

    expect(predict).toHaveBeenCalledTimes(1);
    premier.next(payloadTest({ state: 'ATTENDRE', probabilityUp: 0.51 }));
    premier.complete();
    fixture.detectChanges();

    tick(10_000);
    fixture.detectChanges();
    expect(predict).toHaveBeenCalledTimes(1);
    expect(predict.calls.allArgs()).toEqual([[true]]);

    boutonActualiser().click();
    fixture.detectChanges();
    expect(predict).toHaveBeenCalledTimes(2);
    expect(texte()).toContain('Mise à jour');
    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('masque le résumé SHAP derrière « Comprendre cette prédiction », fermé par défaut', () => {
    predict.and.returnValue(ofSync(payloadTest({ state: 'ATTENDRE', probabilityUp: 0.51 })));
    creer();

    const bloc = fixture.nativeElement.querySelector('details') as HTMLDetailsElement | null;
    expect(bloc).toBeTruthy();
    expect(bloc?.open).toBeFalse();
    expect(texte()).toContain('Comprendre cette prédiction');
    expect(visible()).not.toContain('Résumé SYNTHÉTIQUE de test');
    expect(visible()).toContain('TEST SHAP 1');
    expect(visible()).toContain(AVIS_TEST);

    const titre = bloc?.querySelector('summary') as HTMLElement;
    titre.click();
    fixture.detectChanges();
    expect(bloc?.open).toBeTrue();
    expect(visible()).toContain('Résumé SYNTHÉTIQUE de test');
  });

  it('garde les avertissements visibles quand le résumé est fermé', () => {
    predict.and.returnValue(ofSync(payloadTest({ state: 'HAUSSE', probabilityUp: 0.72 })));
    creer();

    expect((fixture.nativeElement.querySelector('details') as HTMLDetailsElement).open).toBeFalse();
    expect(visible()).toContain(AVIS_TEST);
    expect(visible()).toContain("aucun ordre n'est passé depuis ce panneau");
  });

  it('ne passe aucun ordre et n’injecte pas CryptoApiService', () => {
    const passerOrdre = spyOn(CryptoApiService.prototype, 'passerOrdre');
    predict.and.returnValue(ofSync(payloadTest({ state: 'HAUSSE', probabilityUp: 0.72 })));
    creer();

    expect(passerOrdre).not.toHaveBeenCalled();
    expect(texte()).toContain("aucun ordre n'est passé depuis ce panneau");
    expect(texte()).not.toContain('Acheter');
    expect(texte()).not.toContain('Vendre');
    expect(texte()).not.toContain('Passer un ordre');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  function creer(): void {
    fixture = TestBed.createComponent(AiAdvisorPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function texte(): string {
    return (fixture.nativeElement.textContent as string) ?? '';
  }

  function visible(): string {
    return (fixture.nativeElement as HTMLElement).innerText ?? '';
  }

  function boutonActualiser(): HTMLButtonElement {
    const bouton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((el) => (el.textContent ?? '').includes('Actualiser'));
    expect(bouton).toBeTruthy();
    return bouton as HTMLButtonElement;
  }
});

function contrib(
  rank: number,
  feature: string,
  label_fr: string,
  value_display: string,
  contribution: number,
): ContributionXai {
  return {
    rank,
    feature,
    label_fr,
    group: 'test-spec',
    unit: '%',
    value: 0,
    value_display,
    contribution,
    direction: contribution >= 0 ? 'vers_hausse' : 'vers_baisse',
  };
}

function blocPrediction(state: EtatIa, probability_up: number): PredictionBloc {
  return {
    probability_up,
    signal_authorized: true,
    margin: 0.055,
    threshold_up: 0.555,
    threshold_down: 0.445,
    state,
  };
}

function payloadTest(opts: {
  state: EtatIa;
  probabilityUp: number;
  candle?: string;
  decision?: string;
  validite?: string;
}): PredictResponse {
  const prediction = blocPrediction(opts.state, opts.probabilityUp);
  const candle_open_time_utc = opts.candle ?? '2026-11-11T09:00:00.000Z';
  const decision_time_utc = opts.decision ?? '2026-11-11T10:00:00.000Z';
  const valid_until_utc = opts.validite ?? '2099-01-01T00:00:00.000Z';
  const explication = xaiTest(prediction, candle_open_time_utc, decision_time_utc);
  return {
    schema_version: 'predict-1.0',
    mode: 'temps_reel',
    symbol: 'BTCUSDT',
    interval: '1h',
    candle_open_time_utc,
    decision_time_utc,
    valid_until_utc,
    prediction,
    model: {
      dataset_id: 'TEST-SYNTHETIQUE-SPEC-ANGULAR',
      experiment: 'spec-ai-advisor',
      trial_id: 'fixture-only',
      sha256_model: '0'.repeat(64),
      sha256_selection: '1'.repeat(64),
    },
    data_source: {
      provider: 'test-synthetique',
      candles_requested: 0,
      candles_used: 0,
      all_closed: true,
      discarded_open: 0,
      consecutive: true,
      last_segment_length: 0,
      gaps: 0,
      first_open_time_utc: candle_open_time_utc,
      last_open_time_utc: candle_open_time_utc,
      binance_server_time_utc: decision_time_utc,
    },
    explication,
    warnings: [AVIS_TEST],
  };
}

function payloadIncoherent(opts: {
  statePredite: EtatIa;
  stateExpliquee: EtatIa;
  pPredite: number;
  pExpliquee: number;
}): PredictResponse {
  const base = payloadTest({ state: opts.statePredite, probabilityUp: opts.pPredite });
  const expliquee = blocPrediction(opts.stateExpliquee, opts.pExpliquee);
  return {
    ...base,
    explication: {
      ...(base.explication as XaiResponse),
      prediction: expliquee,
    },
  };
}

function xaiTest(prediction: PredictionBloc, candle: string, decision: string): XaiResponse {
  return {
    schema_version: 'xai-1.0',
    data_origin: 'synthetique',
    symbol: 'BTCUSDT',
    interval: '1h',
    candle_open_time_utc: candle,
    decision_time_utc: decision,
    model: {
      dataset_id: 'TEST-SYNTHETIQUE-SPEC-ANGULAR',
      experiment: 'spec-ai-advisor',
      trial_id: 'fixture-only',
      sha256_model: '0'.repeat(64),
      sha256_selection: '1'.repeat(64),
    },
    prediction,
    explanation: {
      method: 'TreeSHAP',
      library: 'test',
      output_space: 'probability',
      base_value: 0.5,
      contributions_sum: 0.01,
      additivity_error: 0,
      tolerance: 1e-12,
      contributions: CONTRIBUTIONS_TEST,
      groups: [],
      top_k: 5,
    },
    summary_fr: 'Résumé SYNTHÉTIQUE de test : ces contributions ne viennent pas du modèle figé.',
    warnings: [AVIS_TEST],
  };
}

function ofSync(reponse: PredictResponse): Observable<PredictResponse> {
  return new Observable((observer) => {
    observer.next(reponse);
    observer.complete();
  });
}

function throwHttp(status: number, code: string, message: string): Observable<never> {
  return throwError(
    () =>
      new HttpErrorResponse({
        status,
        statusText: 'Error',
        url: 'http://127.0.0.1:8000/api/ia/predict',
        error: {
          status,
          code,
          message,
          horodatage: '2026-11-11T10:00:00.000Z',
        },
      }),
  );
}
