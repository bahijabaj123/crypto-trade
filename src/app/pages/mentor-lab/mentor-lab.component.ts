import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { SparklineComponent } from '../../shared/components/learning/sparkline/sparkline.component';
import { MentorCase, MentorChatMessage } from '../../shared/learning/models/ai-lab.models';
import { AiLearningEngineService } from '../../shared/learning/services/ai-learning-engine.service';

@Component({
  selector: 'app-mentor-lab',
  imports: [RouterModule, PageBreadcrumbComponent, SparklineComponent, FormsModule],
  templateUrl: './mentor-lab.component.html',
})
export class MentorLabComponent {
  private readonly engine = inject(AiLearningEngineService);

  kase = signal<MentorCase | null>(null);
  qIndex = signal(0);
  messages = signal<MentorChatMessage[]>([]);
  draft = '';
  hits = 0;
  done = signal(false);
  synthesis = signal('');
  xp = 0;

  start(): void {
    const k = this.engine.generateMentorCase();
    this.kase.set(k);
    this.qIndex.set(0);
    this.hits = 0;
    this.done.set(false);
    this.synthesis.set('');
    this.xp = 0;
    this.draft = '';
    this.messages.set([
      { role: 'system', text: k.brief },
      { role: 'mentor', text: k.questions[0].prompt },
    ]);
  }

  send(): void {
    const k = this.kase();
    const text = this.draft.trim();
    if (!k || !text || this.done()) {
      return;
    }
    const q = k.questions[this.qIndex()];
    const ev = this.engine.evaluateMentorAnswer(q, text);
    this.hits += ev.hits.length;
    this.messages.update((m) => [
      ...m,
      { role: 'you', text },
      { role: 'mentor', text: ev.coach + (ev.hits.length ? ` (concepts : ${ev.hits.join(', ')})` : '') },
    ]);
    this.draft = '';
    const next = this.qIndex() + 1;
    if (next >= k.questions.length) {
      const fin = this.engine.finishMentor(this.hits, k.questions.length, k);
      this.xp = fin.xp;
      this.synthesis.set(fin.synthesis);
      this.done.set(true);
      this.messages.update((m) => [...m, { role: 'mentor', text: fin.synthesis + ` (+${fin.xp} XP)` }]);
      return;
    }
    this.qIndex.set(next);
    this.messages.update((m) => [...m, { role: 'mentor', text: k.questions[next].prompt }]);
  }
}
