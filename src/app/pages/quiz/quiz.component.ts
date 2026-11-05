import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { Quiz, QuizAttempt } from '../../shared/learning/models/formation.models';
import { FormationService } from '../../shared/learning/services/formation.service';

@Component({
  selector: 'app-quiz',
  imports: [RouterModule, PageBreadcrumbComponent, DatePipe],
  templateUrl: './quiz.component.html',
  styleUrl: './quiz.component.css',
})
export class QuizComponent {
  private readonly formation = inject(FormationService);

  readonly quizzes = this.formation.getQuizzes();
  readonly recommended = this.quizzes.filter((q) => q.recommended);
  readonly recent = this.formation.getRecentQuizAttempts(5);

  bestScore(quiz: Quiz): string {
    const best = this.formation.getBestQuizAttempt(quiz.id);
    if (!best) {
      return '—';
    }
    return `${Math.round((best.score / best.total) * 100)} %`;
  }

  statusLabel(quiz: Quiz): string {
    const best = this.formation.getBestQuizAttempt(quiz.id);
    if (!best) {
      return 'Non commencé';
    }
    return best.passed ? 'Réussi' : 'À améliorer';
  }

  quizTitle(attempt: QuizAttempt): string {
    return this.formation.getQuizById(attempt.quizId)?.title ?? attempt.quizId;
  }
}
