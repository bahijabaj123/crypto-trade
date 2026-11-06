import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { LessonRoadmapComponent } from '../../shared/components/learning/lesson-roadmap/lesson-roadmap.component';
import { PracticalLabComponent } from '../../shared/components/learning/practical-lab/practical-lab.component';
import { MiniPriceChartComponent } from '../../shared/components/learning/mini-price-chart/mini-price-chart.component';
import { Course, Lesson, LessonStatus } from '../../shared/learning/models/formation.models';
import { FormationService } from '../../shared/learning/services/formation.service';

@Component({
  selector: 'app-learning-course',
  imports: [
    RouterModule,
    LessonRoadmapComponent,
    PracticalLabComponent,
    MiniPriceChartComponent,
  ],
  templateUrl: './learning-course.component.html',
})
export class LearningCourseComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formation = inject(FormationService);

  course: Course | undefined;
  lessons: Lesson[] = [];
  activeLesson: Lesson | undefined;
  notFound = false;
  locked = false;
  unlockMessage?: string;
  knowledgeAnswer: number | null = null;
  completeMessage = '';

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const courseId = params.get('courseId');
      if (!courseId) {
        this.notFound = true;
        return;
      }
      this.loadCourse(courseId);
      if (this.notFound) {
        return;
      }
      const lessonId = params.get('lessonId');
      if (lessonId) {
        this.setActiveLesson(lessonId);
        return;
      }
      if (!this.locked) {
        const current = this.formation.getCurrentLessonId(courseId);
        if (current) {
          void this.router.navigate(['/learning/course', courseId, 'lesson', current], { replaceUrl: true });
        }
      }
    });
  }

  private loadCourse(courseId: string): void {
    this.course = this.formation.getCourseById(courseId);
    if (!this.course) {
      this.notFound = true;
      return;
    }
    this.notFound = false;
    this.locked = !this.formation.isCourseUnlocked(courseId);
    this.unlockMessage = this.formation.getUnlockMessage(courseId);
    this.lessons = this.formation.getLessonsForCourse(courseId);
  }

  private setActiveLesson(lessonId: string): void {
    const lesson = this.formation.getLessonById(lessonId);
    if (!lesson || !this.course) {
      return;
    }
    const status = this.formation.getLessonStatus(this.course.id, lesson);
    if (status === 'LOCKED') {
      const current = this.formation.getCurrentLessonId(this.course.id);
      if (current) {
        this.router.navigate(['/learning/course', this.course.id, 'lesson', current]);
      }
      return;
    }
    this.activeLesson = lesson;
    this.knowledgeAnswer = null;
    this.completeMessage = '';
  }

  statusFor = (lesson: Lesson): LessonStatus => {
    if (!this.course) {
      return 'LOCKED';
    }
    return this.formation.getLessonStatus(this.course.id, lesson);
  };

  onLessonSelect(lessonId: string): void {
    if (!this.course) {
      return;
    }
    this.router.navigate(['/learning/course', this.course.id, 'lesson', lessonId]);
    this.setActiveLesson(lessonId);
  }

  markCompleted(): void {
    if (!this.activeLesson) {
      return;
    }
    const ok = this.formation.completeLesson(this.activeLesson.id);
    if (ok) {
      this.completeMessage = `Leçon terminée — +30 XP`;
      this.course = this.formation.getCourseById(this.activeLesson.courseId);
      const next = this.lessons.find((l) => l.order === this.activeLesson!.order + 1);
      if (next && this.statusFor(next) !== 'LOCKED') {
        void this.router.navigate(['/learning/course', this.activeLesson.courseId, 'lesson', next.id]);
        this.setActiveLesson(next.id);
      }
    }
  }

  goPrev(): void {
    if (!this.activeLesson || !this.course) {
      return;
    }
    const prev = this.lessons.find((l) => l.order === this.activeLesson!.order - 1);
    if (prev) {
      this.onLessonSelect(prev.id);
    }
  }

  goNext(): void {
    if (!this.activeLesson || !this.course) {
      return;
    }
    const next = this.lessons.find((l) => l.order === this.activeLesson!.order + 1);
    if (next && this.statusFor(next) !== 'LOCKED') {
      this.onLessonSelect(next.id);
    }
  }

  formatDuration(minutes: number): string {
    return this.formation.formatDurationMinutes(minutes);
  }

  showChart(): boolean {
    return this.activeLesson?.id === 'technical-analysis-l4';
  }
}
