import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { SparklineComponent } from '../../shared/components/learning/sparkline/sparkline.component';
import { CrisisAction, CrisisDebrief, CrisisScenario } from '../../shared/learning/models/ai-lab.models';
import { AiLearningEngineService } from '../../shared/learning/services/ai-learning-engine.service';

@Component({
  selector: 'app-crisis-lab',
  imports: [RouterModule, PageBreadcrumbComponent, SparklineComponent, DecimalPipe],
  templateUrl: './crisis-lab.component.html',
})
export class CrisisLabComponent {
  private readonly engine = inject(AiLearningEngineService);

  scenario = signal<CrisisScenario | null>(null);
  tickIndex = signal(0);
  actions = signal<CrisisAction[]>([]);
  liveCandles = signal<number[]>([]);
  debrief = signal<CrisisDebrief | null>(null);
  playing = signal(false);

  readonly choices: { id: CrisisAction; label: string; hint: string }[] = [
    { id: 'HOLD', label: 'Tenir', hint: 'Pari que ça se calme' },
    { id: 'CUT_25', label: 'Couper 25 %', hint: 'Réduire le levier émotionnel' },
    { id: 'HEDGE', label: 'Hedger', hint: 'Couper le beta, garder un reste' },
    { id: 'CUT_ALL', label: 'Tout sortir', hint: 'Survie d’abord' },
    { id: 'ADD', label: 'Ajouter', hint: 'Souvent le piège' },
  ];

  start(): void {
    const s = this.engine.generateCrisis();
    this.scenario.set(s);
    this.tickIndex.set(0);
    this.actions.set([]);
    this.debrief.set(null);
    this.liveCandles.set(s.candles.slice(0, 1));
    this.playing.set(true);
  }

  choose(action: CrisisAction): void {
    const s = this.scenario();
    if (!s || this.debrief() || !this.playing()) {
      return;
    }
    const next = [...this.actions(), action];
    this.actions.set(next);
    const i = this.tickIndex();
    this.liveCandles.set(s.candles.slice(0, Math.min(s.candles.length, i + 2)));
    if (i + 1 >= s.ticks.length) {
      this.finish(s, next);
      return;
    }
    this.tickIndex.set(i + 1);
  }

  currentHeadline(): string {
    const s = this.scenario();
    if (!s) {
      return '';
    }
    return s.ticks[this.tickIndex()]?.headline ?? '';
  }

  private finish(s: CrisisScenario, actions: CrisisAction[]): void {
    this.playing.set(false);
    this.liveCandles.set(s.candles);
    this.debrief.set(this.engine.simulateCrisis(s, actions));
  }
}
