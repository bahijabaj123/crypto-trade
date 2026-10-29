import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgApexchartsModule } from 'ng-apexcharts';
import { StressService } from '../stress-testing/stress.service';
import { BankResult, BankType, Status } from '../stress-testing/stress.model';

@Component({
  selector: 'app-stress-compare',
  standalone: true,
  imports: [NgApexchartsModule, DecimalPipe, RouterLink],
  templateUrl: './stress-compare.component.html',
  styleUrls: ['./stress-compare.component.css'],
})
export class StressCompareComponent {
  private service = inject(StressService);

  banks = this.service.banks;
  presets = this.service.presets;
  factors = this.service.factors;
  severities = [
    { label: 'Modérée', value: 0.5 },
    { label: 'Standard', value: 1 },
    { label: 'Sévère', value: 1.5 },
  ];
  typeLabel: Record<BankType, string> = { conventional: 'Conventionnelle', 'non-conventional': 'Non conventionnelle' };
  statusLabel: Record<Status, string> = { resilient: 'Résiliente', vulnerable: 'Vulnérable', critical: 'Critique' };

  severity = signal(this.service.lastRun()?.severity ?? 1);

  // ---- A. Conventionnelles vs non conventionnelles ----
  matrix = computed(() =>
    this.presets.map(s => ({
      scenario: s,
      results: this.banks.map(b => this.service.evaluate(b, s, this.severity())),
    }))
  );

  typeDeltas = computed(() => {
    const out: Record<BankType, number[]> = { conventional: [], 'non-conventional': [] };
    for (const m of this.matrix()) {
      (['conventional', 'non-conventional'] as BankType[]).forEach(t => {
        const rs = m.results.filter(r => r.bank.type === t);
        const avg = rs.reduce((a, r) => a + (r.after.cet1 - r.before.cet1), 0) / (rs.length || 1);
        out[t].push(+avg.toFixed(2));
      });
    }
    return out;
  });

  typeSeries = computed(() => [
    { name: 'Conventionnelles', data: this.typeDeltas()['conventional'] },
    { name: 'Non conventionnelles', data: this.typeDeltas()['non-conventional'] },
  ]);
  typeCategories = this.presets.map(s => s.short);

  typeSummary = computed(() =>
    (['conventional', 'non-conventional'] as BankType[]).map(t => {
      const d = this.typeDeltas()[t];
      const worst = Math.min(...d);
      return {
        label: t === 'conventional' ? 'Conventionnelles' : 'Non conventionnelles',
        islamic: t === 'non-conventional',
        mean: d.reduce((a, b) => a + b, 0) / (d.length || 1),
        worst,
        worstName: this.presets[d.indexOf(worst)]?.name ?? '',
      };
    })
  );

  // ---- C. Pourquoi deux banques réagissent différemment ----
  xaiScenarioId = signal('combined');
  bankAId = signal('atlas');
  bankBId = signal('nour');

  private result(bankId: string): BankResult {
    const bank = this.banks.find(b => b.id === bankId)!;
    const scenario = this.presets.find(s => s.id === this.xaiScenarioId())!;
    return this.service.evaluate(bank, scenario, this.severity());
  }
  resA = computed(() => this.result(this.bankAId()));
  resB = computed(() => this.result(this.bankBId()));

  xaiSeries = computed(() => [
    { name: this.resA().bank.name, data: this.resA().contributions.map(c => +c.points.toFixed(2)) },
    { name: this.resB().bank.name, data: this.resB().contributions.map(c => +c.points.toFixed(2)) },
  ]);
  xaiCategories = this.factors.map(f => f.short);

  xaiText = computed(() => {
    const a = this.resA();
    const b = this.resB();
    if (a.bank.id === b.bank.id) return 'Choisissez deux banques différentes pour comparer.';
    const diffs = a.contributions.map((c, i) => ({ label: c.label, d: c.points - b.contributions[i].points }));
    const top = [...diffs].sort((x, y) => Math.abs(y.d) - Math.abs(x.d))[0];
    const da = a.after.cet1 - a.before.cet1;
    const db = b.after.cet1 - b.before.cet1;
    const hurt = top.d < 0 ? a.bank.name : b.bank.name;
    return `${a.bank.name} perd ${Math.abs(da).toFixed(2)} pts de CET1 contre ${Math.abs(db).toFixed(2)} pts pour ${b.bank.name}. ` +
      `Le facteur qui explique le plus l'écart est « ${top.label} » : ${hurt} est plus touchée de ${Math.abs(top.d).toFixed(2)} pts.`;
  });

  // ---- Options graphiques ----
  typeChart: any = { type: 'bar', height: 320, background: 'transparent', toolbar: { show: false } };
  xaiChart: any = { type: 'bar', height: 340, background: 'transparent', toolbar: { show: false } };
  grid: any = { borderColor: 'rgba(255,255,255,0.06)' };
  legend: any = { labels: { colors: '#d1d5db' } };
  theme: any = { mode: 'dark' };
  tooltip: any = { theme: 'dark' };
  yDelta: any = { labels: { style: { colors: '#9ca3af' }, formatter: (v: number) => v.toFixed(1) } };
  typeX: any = { categories: this.typeCategories, labels: { rotate: -30, trim: true, style: { colors: '#9ca3af' } } };
  xaiX: any = { categories: this.xaiCategories, labels: { style: { colors: '#9ca3af' } } };
  typePlot: any = { bar: { columnWidth: '55%', borderRadius: 3 } };
  xaiPlot: any = { bar: { horizontal: true, barHeight: '65%', borderRadius: 3 } };
  noLabels: any = { enabled: false };
}