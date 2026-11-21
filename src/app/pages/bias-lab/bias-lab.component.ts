import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { SparklineComponent } from '../../shared/components/learning/sparkline/sparkline.component';
import { BIAS_LABELS } from '../../shared/learning/data/ai-lab-corpus';
import { BiasDebrief, BiasScenario, CognitiveBias } from '../../shared/learning/models/ai-lab.models';
import { AiLearningEngineService } from '../../shared/learning/services/ai-learning-engine.service';

@Component({
  selector: 'app-bias-lab',
  imports: [RouterModule, PageBreadcrumbComponent, SparklineComponent, FormsModule],
  templateUrl: './bias-lab.component.html',
})
export class BiasLabComponent {
  private readonly engine = inject(AiLearningEngineService);
  readonly labels = BIAS_LABELS;

  scenario = signal<BiasScenario | null>(null);
  picked = signal<CognitiveBias[]>([]);
  choseSound = signal<boolean | null>(null);
  rationale = '';
  debrief = signal<BiasDebrief | null>(null);

  start(): void {
    this.scenario.set(this.engine.generateBias());
    this.picked.set([]);
    this.choseSound.set(null);
    this.rationale = '';
    this.debrief.set(null);
  }

  chips(): CognitiveBias[] {
    const s = this.scenario();
    if (!s) {
      return [];
    }
    return [...s.trueBiases, ...s.decoyBiases].sort((a, b) => a.localeCompare(b));
  }

  toggle(bias: CognitiveBias): void {
    const set = new Set(this.picked());
    if (set.has(bias)) {
      set.delete(bias);
    } else {
      set.add(bias);
    }
    this.picked.set([...set]);
  }

  isPicked(bias: CognitiveBias): boolean {
    return this.picked().includes(bias);
  }

  submit(): void {
    const s = this.scenario();
    const sound = this.choseSound();
    if (!s || sound === null) {
      return;
    }
    this.debrief.set(this.engine.scoreBias(s, this.picked(), sound, this.rationale));
  }
}
