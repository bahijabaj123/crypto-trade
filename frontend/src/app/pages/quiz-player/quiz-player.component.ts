import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Quiz, QuizAttempt, QuizQuestion } from '../../shared/learning/models/formation.models';
import { FormationService } from '../../shared/learning/services/formation.service';

type ViewMode = 'play' | 'result' | 'review';

@Component({
  selector: 'app-quiz-player',
  imports: [RouterModule],
  templateUrl: './quiz-player.component.html',
})
export class QuizPlayerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly formation = inject(FormationService);

  quiz: Quiz | undefined;
  notFound = false;
  mode = signal<ViewMode>('play');
  currentIndex = signal(0);
  answers = signal<Record<string, number>>({});
  result: QuizAttempt | null = null;
  submitError = '';

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const quizId = params.get('quizId');
      if (!quizId) {
        this.notFound = true;
        return;
      }
      this.quiz = this.formation.getQuizById(quizId);
      if (!this.quiz) {
        this.notFound = true;
        return;
      }
      this.notFound = false;
      const view = this.route.snapshot.queryParamMap.get('view') as ViewMode | null;
      if (view === 'review' && this.formation.lastQuizResult?.quizId === quizId) {
        this.mode.set('review');
        this.result = this.formation.lastQuizResult;
        this.answers.set({ ...this.result.answers });
      } else if (view === 'result' && this.formation.lastQuizResult?.quizId === quizId) {
        this.mode.set('result');
        this.result = this.formation.lastQuizResult;
      } else {
        this.formation.startQuizSession(quizId);
        this.mode.set('play');
        this.currentIndex.set(0);
        this.answers.set({});
        this.result = null;
      }
    });
  }

  get currentQuestion(): QuizQuestion | undefined {
    return this.quiz?.questions[this.currentIndex()];
  }

  progressPercent(): number {
    if (!this.quiz) {
      return 0;
    }
    return Math.round(((this.currentIndex() + 1) / this.quiz.questions.length) * 100);
  }

  selectAnswer(index: number): void {
    const q = this.currentQuestion;
    if (!q) {
      return;
    }
    this.answers.update((a) => ({ ...a, [q.id]: index }));
  }

  selectedIndex(): number | undefined {
    const q = this.currentQuestion;
    if (!q) {
      return undefined;
    }
    return this.answers()[q.id];
  }

  isMarked(): boolean {
    const q = this.currentQuestion;
    if (!q || !this.quiz) {
      return false;
    }
    return this.formation.lastQuizSession?.markedForReview.includes(q.id) ?? false;
  }

  toggleMark(): void {
    const q = this.currentQuestion;
    if (!q || !this.quiz) {
      return;
    }
    this.formation.toggleMarkQuestion(this.quiz.id, q.id);
  }

  prev(): void {
    this.currentIndex.update((i) => Math.max(0, i - 1));
  }

  next(): void {
    if (!this.quiz) {
      return;
    }
    this.currentIndex.update((i) => Math.min(this.quiz!.questions.length - 1, i + 1));
  }

  submit(): void {
    if (!this.quiz) {
      return;
    }
    const unanswered = this.quiz.questions.filter((q) => this.answers()[q.id] === undefined);
    if (unanswered.length > 0) {
      this.submitError = `Répondez à toutes les questions (${unanswered.length} restante(s)).`;
      return;
    }
    this.submitError = '';
    this.result = this.formation.submitQuiz(this.quiz.id, this.answers());
    this.mode.set('result');
    this.router.navigate([], { queryParams: { view: 'result' }, replaceUrl: true });
  }

  openReview(): void {
    this.mode.set('review');
    this.router.navigate([], { queryParams: { view: 'review' }, replaceUrl: true });
  }

  retake(): void {
    if (!this.quiz) {
      return;
    }
    this.formation.startQuizSession(this.quiz.id);
    this.mode.set('play');
    this.currentIndex.set(0);
    this.answers.set({});
    this.result = null;
    this.router.navigate([], { queryParams: {} });
  }

  scorePercent(): number {
    if (!this.result) {
      return 0;
    }
    return Math.round((this.result.score / this.result.total) * 100);
  }

  letter(i: number): string {
    return String.fromCharCode(65 + i);
  }
}
