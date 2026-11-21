import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { PersonalizedBriefing } from '../../shared/learning/models/ai-lab.models';
import { AiLearningEngineService } from '../../shared/learning/services/ai-learning-engine.service';
import { FormationService } from '../../shared/learning/services/formation.service';

@Component({
  selector: 'app-learning-lab',
  imports: [RouterModule, PageBreadcrumbComponent],
  templateUrl: './learning-lab.component.html',
})
export class LearningLabComponent {
  private readonly engine = inject(AiLearningEngineService);
  private readonly formation = inject(FormationService);

  briefing: PersonalizedBriefing = this.engine.generateBriefing();
  readonly labRuns = this.formation.getLabRuns();

  regenerate(): void {
    this.briefing = this.engine.generateBriefing();
  }
}
