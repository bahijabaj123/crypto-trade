import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { StressService } from './stress.service';
import { BankType, FactorDef, FactorKey, Shock } from './stress.model';

@Component({
  selector: 'app-stress-testing',
  standalone: true,
  templateUrl: './stress-testing.component.html',
  styleUrls: ['./stress-testing.component.css'],
})
export class StressTestingComponent {
  private service = inject(StressService);
  private router = inject(Router);

  scenarios = this.service.scenarios;
  factors = this.service.factors;
  banks = this.service.banks;
  severities = [
    { label: 'Modérée', value: 0.5 },
    { label: 'Standard', value: 1 },
    { label: 'Sévère', value: 1.5 },
  ];

  scenarioId = signal(this.scenarios[0].id);
  custom = signal<Shock>({ ...this.service.defaultCustom });
  severity = signal(1);
  selectedBanks = signal<string[]>(this.banks.map(b => b.id));
  loading = signal(false);

  scenario = computed(() => this.scenarios.find(s => s.id === this.scenarioId())!);
  isCustom = computed(() => this.scenarioId() === 'custom');
  shock = computed(() =>
    this.service.scale(this.isCustom() ? this.custom() : this.scenario().shock, this.severity())
  );

  setCustom(key: FactorKey, v: string) {
    this.custom.update(c => ({ ...c, [key]: +v }));
  }

  toggleBank(id: string) {
    this.selectedBanks.update(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));
  }

  selectType(t: BankType | 'all') {
    this.selectedBanks.set(this.banks.filter(b => t === 'all' || b.type === t).map(b => b.id));
  }

  fmt(f: FactorDef, v: number): string {
    const n = Math.round(v * 10) / 10;
    return (n > 0 ? '+' : '') + n + ' ' + f.unit;
  }

  run() {
    this.loading.set(true);
    this.service.run(this.selectedBanks(), this.scenario(), this.custom(), this.severity()).subscribe(() => {
      this.loading.set(false);
      this.router.navigate(['/stress-testing/results']);
    });
  }

  compare() {
    this.router.navigate(['/stress-testing/compare']);
  }
}