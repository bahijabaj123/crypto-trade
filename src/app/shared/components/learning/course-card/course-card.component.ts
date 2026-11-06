import { Component, Input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Course, CourseIconKey } from '../../../learning/models/formation.models';
import { SafeHtmlPipe } from '../../../pipe/safe-html.pipe';

@Component({
  selector: 'app-course-card',
  imports: [RouterModule, SafeHtmlPipe],
  templateUrl: './course-card.component.html',
})
export class CourseCardComponent {
  @Input({ required: true }) course!: Course;
  @Input() locked = false;
  @Input() unlockMessage = '';

  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) {
      return `${mins} min`;
    }
    if (mins === 0) {
      return `${hours} h`;
    }
    return `${hours} h ${mins} min`;
  }

  levelBadgeClass(level: Course['level']): string {
    switch (level) {
      case 'BEGINNER':
        return 'bg-crypto-green/10 text-crypto-green';
      case 'INTERMEDIATE':
        return 'bg-crypto-yellow/10 text-crypto-yellow';
      case 'ADVANCED':
        return 'bg-crypto-purple/10 text-crypto-purple';
    }
  }

  accentGradient(key: CourseIconKey): string {
    const map: Record<CourseIconKey, string> = {
      fundamentals: 'from-crypto-blue/5 to-crypto-green/5',
      trading: 'from-crypto-green/5 to-crypto-yellow/5',
      technical: 'from-crypto-green/10 to-transparent',
      risk: 'from-crypto-yellow/5 to-crypto-red/5',
      advanced: 'from-crypto-purple/10 to-transparent',
      ai: 'from-crypto-purple/10 to-crypto-blue/5',
    };
    return map[key];
  }

  iconFor(key: CourseIconKey): string {
    const icons: Record<CourseIconKey, string> = {
      fundamentals: `<svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
      trading: `<svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 19H20M7 16V10M12 16V6M17 16V13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      technical: `<svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 20L10 12L14 16L20 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      risk: `<svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 9V13M12 17H12.01M10.29 3.86L2.82 17.5C2.45 18.16 2.92 19 3.67 19H20.33C21.08 19 21.55 18.16 21.18 17.5L13.71 3.86C13.33 3.19 12.67 3.19 12.29 3.86Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      advanced: `<svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
      ai: `<svg class="h-7 w-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3C8.5 3 6 5.5 6 9V10C4.9 10 4 10.9 4 12V16C4 17.1 4.9 18 6 18H18C19.1 18 20 17.1 20 16V12C20 10.9 19.1 10 18 10V9C18 5.5 15.5 3 12 3Z" stroke="currentColor" stroke-width="1.5"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/></svg>`,
    };
    return icons[key];
  }
}
