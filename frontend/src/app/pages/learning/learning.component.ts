import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { PageBreadcrumbComponent } from '../../shared/components/common/page-breadcrumb/page-breadcrumb.component';
import { CourseCardComponent } from '../../shared/components/learning/course-card/course-card.component';
import { LearningStatCardComponent } from '../../shared/components/learning/learning-stat-card/learning-stat-card.component';
import { InputFieldComponent } from '../../shared/components/form/input/input-field.component';
import {
  ContinueLearningState,
  Course,
  CourseFilterId,
  FormationGlobalStats,
  LearningRecommendation,
} from '../../shared/learning/models/formation.models';
import { FormationService } from '../../shared/learning/services/formation.service';

interface FilterOption {
  id: CourseFilterId;
  label: string;
}

@Component({
  selector: 'app-learning',
  imports: [
    RouterModule,
    PageBreadcrumbComponent,
    LearningStatCardComponent,
    CourseCardComponent,
    InputFieldComponent,
  ],
  styleUrl: './learning.component.css',
  templateUrl: './learning.component.html',
})
export class LearningComponent implements OnInit {
  private readonly formationService = inject(FormationService);
  private readonly router = inject(Router);

  stats!: FormationGlobalStats;
  readonly allCourses = signal<Course[]>([]);

  readonly searchQuery = signal('');
  readonly activeFilter = signal<CourseFilterId>('ALL');

  readonly filters: FilterOption[] = [
    { id: 'ALL', label: 'Tous' },
    { id: 'BEGINNER', label: 'Débutant' },
    { id: 'INTERMEDIATE', label: 'Intermédiaire' },
    { id: 'ADVANCED', label: 'Avancé' },
    { id: 'COMPLETED', label: 'Terminé' },
    { id: 'IN_PROGRESS', label: 'En cours' },
  ];

  readonly filteredCourses = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const filter = this.activeFilter();

    return this.allCourses().filter((course) => {
      if (!this.matchesFilter(course, filter)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [course.title, course.category, course.description, ...course.topics]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  });

  readonly statIcons = {
    progress: `<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none"><path d="M12 3V6M12 18V21M6 12H3M21 12H18M5.6 5.6L7.7 7.7M16.3 16.3L18.4 18.4M18.4 5.6L16.3 7.7M7.7 16.3L5.6 18.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.5"/></svg>`,
    modules: `<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none"><path d="M4 6H20M4 12H20M4 18H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    quiz: `<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none"><path d="M8 9H16M8 13H13M6 4H18C19.1 4 20 4.9 20 6V18C20 19.1 19.1 20 18 20H6C4.9 20 4 19.1 4 18V6C4 4.9 4.9 4 6 4Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    xp: `<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none"><path d="M12 2L15 8.5L22 9.5L17 14.5L18 21.5L12 18.5L6 21.5L7 14.5L2 9.5L9 8.5L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  };

  continueState: ContinueLearningState | null = null;
  recommendation!: LearningRecommendation;

  ngOnInit(): void {
    this.reloadDashboard();
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        if (e.urlAfterRedirects === '/learning' || e.urlAfterRedirects.startsWith('/learning?')) {
          this.reloadDashboard();
        }
      });
  }

  private reloadDashboard(): void {
    this.refresh();
    this.continueState = this.formationService.getContinueLearning();
    this.recommendation = this.formationService.getRecommendation();
  }

  refresh(): void {
    this.stats = this.formationService.getGlobalStats();
    this.allCourses.set(this.formationService.getCourses());
  }

  isLocked(courseId: string): boolean {
    return this.formationService.isCourseLocked(courseId);
  }

  unlockMessage(courseId: string): string {
    return this.formationService.getUnlockMessage(courseId) ?? '';
  }

  onSearchInput(value: string | number): void {
    this.searchQuery.set(String(value));
  }

  setFilter(filterId: CourseFilterId): void {
    this.activeFilter.set(filterId);
  }

  isFilterActive(filterId: CourseFilterId): boolean {
    return this.activeFilter() === filterId;
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.activeFilter.set('ALL');
  }

  private matchesFilter(course: Course, filter: CourseFilterId): boolean {
    switch (filter) {
      case 'ALL':
        return true;
      case 'BEGINNER':
        return course.level === 'BEGINNER';
      case 'INTERMEDIATE':
        return course.level === 'INTERMEDIATE';
      case 'ADVANCED':
        return course.level === 'ADVANCED';
      case 'COMPLETED':
        return course.progress >= 100;
      case 'IN_PROGRESS':
        return course.progress > 0 && course.progress < 100;
    }
  }
}
