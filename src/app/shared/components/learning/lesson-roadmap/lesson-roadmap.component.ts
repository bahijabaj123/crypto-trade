import { Component, Input, Output, EventEmitter } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Lesson, LessonStatus } from '../../../learning/models/formation.models';

@Component({
  selector: 'app-lesson-roadmap',
  imports: [RouterModule],
  templateUrl: './lesson-roadmap.component.html',
})
export class LessonRoadmapComponent {
  @Input({ required: true }) courseId!: string;
  @Input({ required: true }) lessons!: Lesson[];
  @Input({ required: true }) activeLessonId!: string;
  @Input({ required: true }) statusFor!: (lesson: Lesson) => LessonStatus;
  @Output() lessonSelect = new EventEmitter<string>();

  trackStatus(status: LessonStatus): string {
    return status;
  }

  statusLabel(status: LessonStatus): string {
    switch (status) {
      case 'COMPLETED':
        return 'Terminée';
      case 'CURRENT':
        return 'En cours';
      case 'LOCKED':
        return 'Verrouillée';
    }
  }

  onSelect(lesson: Lesson, status: LessonStatus): void {
    if (status === 'LOCKED') {
      return;
    }
    this.lessonSelect.emit(lesson.id);
  }
}
