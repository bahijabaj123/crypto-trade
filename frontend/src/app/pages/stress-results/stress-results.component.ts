import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { StressService } from '../stress-testing/stress.service';
import { BankType, Indicators, Status } from '../stress-testing/stress.model';

@Component({
  selector: 'app-stress-results',
  standalone: true,
  imports: [NgApexchartsModule, DecimalPipe, DatePipe, RouterLink],
  templateUrl: './stress-results.component.html',
  styleUrls: ['./stress-results.component.css'],
})
export class StressResultsComponent {
  service = inject(StressService);

  run = this.service.lastRun;
  selectedId = signal<string | null>(null);

  statusLabel: Record<Status, string> = { resilient: 'Résiliente', vulnerable: 'Vulnérable', critical: 'Critique' };
  typeLabel: Record<BankType, string> = { conventional: 'Conventionnelle', 'non-conventional': 'Non conventionnelle' };
  years = ['Départ', 'Année 1', 'Année 2', 'Année 3'];

  results = computed(() => this.run()?.results ?? []);
  current = computed(() => {
    const rs = this.results();
    return rs.find(r => r.bank.id === this.selectedId()) ?? rs[0] ?? null;
  });

  // ---- Comparatif avant / après (toutes les banques) ----
  compareSeries = computed(() => [
    { name: 'Avant', data: this.results().map(r => +r.before.cet1.toFixed(2)) },
    { name: 'Après stress', data: this.results().map(r => +r.after.cet1.toFixed(2)) },
  ]);
  compareCategories = computed(() => this.results().map(r => r.bank.name));

  // ---- Trajectoire CET1 (banque sélectionnée) ----
  pathSeries = computed(() => {
    const r = this.current();
    if (!r) return [];
    return [
      { name: 'Scénario de base', data: r.cet1Base.map(v => +v.toFixed(2)) },
      { name: 'Scénario de stress', data: r.cet1Path.map(v => +v.toFixed(2)) },
    ];
  });

  // ---- Explication : contribution de chaque facteur ----
  contribSorted = computed(() => [...(this.current()?.contributions ?? [])].sort((a, b) => a.points - b.points));
  contribSeries = computed(() => [{ name: 'Contribution au CET1 (pts)', data: this.contribSorted().map(c => +c.points.toFixed(2)) }]);
  contribCategories = computed(() => this.contribSorted().map(c => c.label));

  indicatorRows = computed(() => {
    const r = this.current();
    if (!r) return [];
    const defs: { key: keyof Indicators; label: string; higherBetter: boolean }[] = [
      { key: 'cet1', label: 'Ratio CET1', higherBetter: true },
      { key: 'npl', label: 'Créances douteuses (NPL)', higherBetter: false },
      { key: 'roa', label: 'Rentabilité des actifs (ROA)', higherBetter: true },
      { key: 'lcr', label: 'Ratio de liquidité (LCR)', higherBetter: true },
    ];
    return defs.map(d => {
      const before = r.before[d.key];
      const after = r.after[d.key];
      const delta = after - before;
      return { ...d, before, after, delta, bad: d.higherBetter ? delta < 0 : delta > 0 };
    });
  });

  insights = computed(() => {
    const r = this.current();
    if (!r) return [];
    const neg = r.contributions.filter(c => c.points < 0).sort((a, b) => a.points - b.points);
    const total = neg.reduce((s, c) => s + c.points, 0);
    const out: string[] = [];
    if (neg.length) {
      out.push(`Facteur le plus pénalisant : ${neg[0].label} (${neg[0].points.toFixed(2)} pts, ${Math.round((neg[0].points / total) * 100)} % de l'impact négatif).`);
      if (neg[1]) out.push(`Deuxième facteur : ${neg[1].label} (${neg[1].points.toFixed(2)} pts).`);
    }
    const d = r.after.cet1 - r.before.cet1;
    out.push(`Le CET1 passe de ${r.before.cet1.toFixed(1)} % à ${r.after.cet1.toFixed(1)} % (${d.toFixed(2)} pts).`);
    out.push(
      r.after.cet1 < 7
        ? 'Sous le seuil indicatif de 7 % : vulnérabilité critique, une recapitalisation serait à envisager.'
        : r.after.cet1 < 10
          ? 'Au-dessus de 7 % mais sous 10 % : la marge de sécurité est réduite.'
          : 'Au-dessus de 10 % : la banque absorbe le choc.'
    );
    out.push(
      r.bank.type === 'conventional'
        ? "D'après les sensibilités du modèle, l'impact d'une banque conventionnelle passe surtout par les taux et les défauts de crédit."
        : "D'après les sensibilités du modèle, une banque non conventionnelle a une exposition directe aux taux limitée, mais reste plus sensible à la valeur des actifs et aux marchés."
    );
    return out;
  });

  // ---- Options graphiques ----
  barChart: any = { type: 'bar', height: 280, background: 'transparent', toolbar: { show: false } };
  lineChart: any = { type: 'line', height: 280, background: 'transparent', toolbar: { show: false }, animations: { enabled: false } };
  contribChart: any = { type: 'bar', height: 300, background: 'transparent', toolbar: { show: false } };
  grid: any = { borderColor: 'rgba(255,255,255,0.06)' };
  legend: any = { labels: { colors: '#d1d5db' } };
  theme: any = { mode: 'dark' };
  tooltip: any = { theme: 'dark' };
  yPct: any = { min: 0, labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => v.toFixed(1) + ' %' } };
  pathAnnotations: any = {
    yaxis: [
      { y: 7, borderColor: '#ef4444', strokeDashArray: 4, label: { text: 'Seuil 7 %', style: { color: '#fff', background: '#ef4444' } } },
      { y: 10, borderColor: '#f59e0b', strokeDashArray: 4, label: { text: 'Seuil 10 %', style: { color: '#000', background: '#f59e0b' } } },
    ],
  };
  contribPlot: any = {
    bar: {
      horizontal: true, borderRadius: 4, barHeight: '60%',
      colors: { ranges: [{ from: -100, to: 0, color: '#ef4444' }, { from: 0, to: 100, color: '#22c55e' }] },
    },
  };
  contribLabels: any = { enabled: true, formatter: (v: number) => v.toFixed(2), style: { colors: ['#fff'] } };
}