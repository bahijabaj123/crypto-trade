import { Injectable, signal } from '@angular/core';
import { Observable, of, delay, tap } from 'rxjs';
import {
  Bank, BankResult, BankType, FactorDef, FactorKey, Indicators, Scenario, Shock, Status,
  StressHistoryItem, StressRun,
} from './stress.model';

const sh = (o: Partial<Shock> = {}): Shock => ({
  gdp: 0, rates: 0, unemployment: 0, defaults: 0, assetQuality: 0, revenue: 0, markets: 0, ...o,
});

const prof = (o: Partial<Record<FactorKey, number>> = {}): Record<FactorKey, number> => ({
  gdp: 1, rates: 1, unemployment: 1, defaults: 1, assetQuality: 1, revenue: 1, markets: 1, ...o,
});

@Injectable({ providedIn: 'root' })
export class StressService {
  readonly history = signal<StressHistoryItem[]>([]);
  readonly lastRun = signal<StressRun | null>(null);

  readonly factors: FactorDef[] = [
    { key: 'gdp', label: 'PIB (variation)', short: 'PIB', unit: 'pts', min: -10, max: 2, step: 0.5 },
    { key: 'rates', label: 'Taux d’intérêt', short: 'Taux', unit: 'pb', min: 0, max: 500, step: 25 },
    { key: 'unemployment', label: 'Chômage', short: 'Chômage', unit: 'pts', min: 0, max: 10, step: 0.5 },
    { key: 'defaults', label: 'Taux de défaut des emprunteurs', short: 'Défauts', unit: 'pts', min: 0, max: 10, step: 0.5 },
    { key: 'assetQuality', label: 'Dégradation de la qualité des actifs', short: 'Qualité actifs', unit: '%', min: -30, max: 0, step: 1 },
    { key: 'revenue', label: 'Baisse des revenus', short: 'Revenus', unit: '%', min: -30, max: 0, step: 1 },
    { key: 'markets', label: 'Baisse des marchés financiers', short: 'Marchés', unit: '%', min: -60, max: 0, step: 1 },
  ];

  /** Impact sur le CET1 (pts) par unité de choc, selon le type de banque. Valeurs illustratives. */
  private readonly SENS: Record<BankType, Record<FactorKey, number>> = {
    conventional: { gdp: 0.30, rates: -0.0020, unemployment: -0.20, defaults: -0.35, assetQuality: 0.08, revenue: 0.05, markets: 0.03 },
    'non-conventional': { gdp: 0.28, rates: -0.0004, unemployment: -0.19, defaults: -0.26, assetQuality: 0.14, revenue: 0.045, markets: 0.06 },
  };

  readonly scenarios: Scenario[] = [
    { id: 'rates', name: 'Hausse des taux d’intérêt (+300 pb)', short: 'Taux +300 pb',
      description: 'Remontée brutale des taux : renchérissement du refinancement et baisse de valeur des titres.',
      shock: sh({ rates: 300 }) },
    { id: 'markets', name: 'Krach des marchés financiers (−35 %)', short: 'Krach marchés',
      description: 'Chute des marchés actions et obligataires, pertes sur le portefeuille de titres.',
      shock: sh({ markets: -35, revenue: -5 }) },
    { id: 'recession', name: 'Récession économique', short: 'Récession',
      description: 'Contraction du PIB, hausse du chômage et des défauts, baisse des revenus.',
      shock: sh({ gdp: -4, unemployment: 4, revenue: -10, defaults: 3 }) },
    { id: 'unemployment', name: 'Flambée du chômage', short: 'Chômage',
      description: 'Hausse forte du chômage qui fragilise la capacité de remboursement des ménages.',
      shock: sh({ unemployment: 6, defaults: 2, gdp: -1.5 }) },
    { id: 'defaults', name: 'Hausse des défauts de paiement', short: 'Défauts',
      description: 'Augmentation du taux de défaut des emprunteurs et dépréciation des garanties.',
      shock: sh({ defaults: 5, assetQuality: -10 }) },
    { id: 'assets', name: 'Dégradation de la qualité des actifs', short: 'Actifs dégradés',
      description: 'Baisse de valeur des actifs (immobilier, créances, garanties).',
      shock: sh({ assetQuality: -20, markets: -10, defaults: 1 }) },
    { id: 'revenue', name: 'Baisse importante des revenus', short: 'Revenus',
      description: 'Effondrement des marges et des commissions.',
      shock: sh({ revenue: -20, gdp: -1 }) },
    { id: 'combined', name: 'Crise combinée (chocs simultanés)', short: 'Crise combinée',
      description: 'Choc simultané sur la croissance, les taux, l’emploi, le crédit et les marchés.',
      shock: sh({ gdp: -4, rates: 200, unemployment: 4, defaults: 3, assetQuality: -10, revenue: -10, markets: -25 }) },
    { id: 'custom', name: 'Scénario personnalisé', short: 'Personnalisé',
      description: 'Définissez vous-même chaque hypothèse macro-économique.',
      shock: sh() },
  ];

  readonly presets = this.scenarios.filter(s => s.id !== 'custom');

  readonly defaultCustom: Shock = sh({
    gdp: -2, rates: 100, unemployment: 2, defaults: 1.5, assetQuality: -5, revenue: -5, markets: -10,
  });

  /** Banques fictives (données de démonstration) */
  readonly banks: Bank[] = [
    { id: 'atlas', name: 'Banque Atlas', type: 'conventional', totalAssets: 42,
      indicators: { cet1: 13.8, npl: 5.2, roa: 1.1, lcr: 145 }, profile: prof({ rates: 1.2, markets: 0.9 }) },
    { id: 'medina', name: 'Banque Médina', type: 'conventional', totalAssets: 18,
      indicators: { cet1: 11.9, npl: 8.4, roa: 0.8, lcr: 128 },
      profile: prof({ defaults: 1.4, unemployment: 1.3, gdp: 1.2, rates: 0.9, markets: 0.7 }) },
    { id: 'nour', name: 'Banque Nour', type: 'non-conventional', totalAssets: 12,
      indicators: { cet1: 14.6, npl: 4.1, roa: 1.3, lcr: 152 }, profile: prof({ assetQuality: 1.3, markets: 1.1, defaults: 0.8 }) },
    { id: 'safa', name: 'Banque Safa', type: 'non-conventional', totalAssets: 9,
      indicators: { cet1: 12.4, npl: 6.7, roa: 0.9, lcr: 133 }, profile: prof({ assetQuality: 1.5, markets: 1.4, gdp: 1.1 }) },
  ];

  scale(s: Shock, k: number): Shock {
    return Object.fromEntries(Object.entries(s).map(([key, v]) => [key, v * k])) as Shock;
  }

  private status(cet1: number): Status {
    return cet1 >= 10 ? 'resilient' : cet1 >= 7 ? 'vulnerable' : 'critical';
  }

  private compute(bank: Bank, shock: Shock): BankResult {
    const sens = this.SENS[bank.type];
    const p = bank.profile;
    const conv = bank.type === 'conventional';
    const b = bank.indicators;

    // Décomposition de l'impact CET1 par facteur
    const contributions = this.factors.map(f => ({
      key: f.key,
      label: f.short,
      points: shock[f.key] * sens[f.key] * p[f.key],
    }));
    const delta = contributions.reduce((s, c) => s + c.points, 0);

    const nplUp = Math.max(0,
      shock.defaults * 0.9 * p.defaults +
      shock.unemployment * 0.3 * p.unemployment +
      Math.max(0, -shock.gdp) * 0.25 * p.gdp -
      shock.assetQuality * 0.06 * p.assetQuality
    );

    const after: Indicators = {
      cet1: Math.max(0, b.cet1 + delta),
      npl: b.npl + nplUp,
      roa: b.roa + shock.revenue * 0.03 - nplUp * 0.12 - shock.rates * (conv ? 0.0004 : 0.0001),
      lcr: Math.max(0, b.lcr + shock.markets * 0.3 - shock.rates * (conv ? 0.06 : 0.025) - shock.unemployment),
    };

    const ramp = [0.45, 0.85, 1];
    return {
      bank,
      before: { ...b },
      after,
      cet1Path: [b.cet1, ...ramp.map(r => Math.max(0, b.cet1 + delta * r))],
      cet1Base: [b.cet1, b.cet1 + 0.2, b.cet1 + 0.4, b.cet1 + 0.6],
      contributions,
      lossesBn: (Math.max(0, -delta) / 100) * bank.totalAssets * 0.55,
      status: this.status(after.cet1),
    };
  }

  evaluate(bank: Bank, scenario: Scenario, severity: number): BankResult {
    return this.compute(bank, this.scale(scenario.shock, severity));
  }

  /** 👉 À remplacer par un appel HTTP vers le back (modèle ML + SHAP) */
  run(bankIds: string[], scenario: Scenario, custom: Shock, severity: number): Observable<StressRun> {
    const base = scenario.id === 'custom' ? custom : scenario.shock;
    const shock = this.scale(base, severity);
    const results = this.banks.filter(b => bankIds.includes(b.id)).map(b => this.compute(b, shock));
    const run: StressRun = { date: new Date(), scenario, severity, shock, results };

    return of(run).pipe(
      delay(600),
      tap(() => {
        this.lastRun.set(run);
        const avg = results.reduce((a, r) => a + (r.after.cet1 - r.before.cet1), 0) / (results.length || 1);
        this.history.update(h => [
          { date: run.date, scenario: scenario.name, severity, banks: results.length, avgImpact: avg }, ...h,
        ]);
      })
    );
  }
}