import { Injectable } from '@angular/core';
import {
  FORMATION_COURSES,
  FORMATION_LESSONS,
  FORMATION_QUIZZES,
  LESSON_XP,
  LEVEL_THRESHOLDS,
} from '../data/formation-data';
import {
  Achievement,
  ContinueLearningState,
  Course,
  FormationGlobalStats,
  FormationStoredState,
  LearnerLevel,
  LearningActivity,
  LearningRecommendation,
  Lesson,
  LessonStatus,
  Quiz,
  QuizAttempt,
  SkillProgress,
} from '../models/formation.models';
import { FormationStorageService } from './formation-storage.service';

export interface ActiveQuizSession {
  quizId: string;
  answers: Record<string, number>;
  markedForReview: string[];
  startedAt: number;
}

@Injectable({ providedIn: 'root' })
export class FormationService {
  private state!: FormationStoredState;
  lastQuizSession: ActiveQuizSession | null = null;
  lastQuizResult: QuizAttempt | null = null;

  constructor(private readonly storage: FormationStorageService) {
    this.bootstrap();
  }

  private bootstrap(): void {
    const loaded = this.storage.load();
    if (loaded?.version === 1) {
      this.state = loaded;
      return;
    }
    this.state = this.createSeedState();
    this.persist();
  }

  private createSeedState(): FormationStoredState {
    const completed = [
      ...FORMATION_LESSONS.filter((l) => l.courseId === 'crypto-fundamentals').map((l) => l.id),
      'trading-basics-l1',
      'trading-basics-l2',
      'trading-basics-l3',
      'technical-analysis-l1',
      'technical-analysis-l2',
      'technical-analysis-l3',
      'risk-management-l1',
    ];
    const attempts: QuizAttempt[] = [
      {
        quizId: 'fondamentaux-crypto',
        score: 9,
        total: 10,
        passed: true,
        xpEarned: 120,
        answers: {},
        completedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        durationSeconds: 462,
      },
      {
        quizId: 'analyse-technique',
        score: 12,
        total: 15,
        passed: true,
        xpEarned: 160,
        answers: {},
        completedAt: new Date(Date.now() - 86400000).toISOString(),
        durationSeconds: 720,
      },
    ];
    return {
      version: 1,
      completedLessonIds: completed,
      quizAttempts: attempts,
      activityLog: [
        {
          id: 'a1',
          dateLabel: "Aujourd'hui",
          title: '+40 XP',
          subtitle: 'Leçon « Supports et résistances » complétée',
          xpDelta: 40,
          kind: 'lesson',
        },
        {
          id: 'a2',
          dateLabel: 'Hier',
          title: 'Quiz Analyse Technique',
          subtitle: 'Score 80 %',
          kind: 'quiz',
        },
        {
          id: 'a3',
          dateLabel: 'Il y a 2 jours',
          title: 'Gestion des Risques',
          subtitle: 'Module démarré',
          kind: 'module',
        },
      ],
      seeded: true,
    };
  }

  private persist(): void {
    this.storage.save(this.state);
  }

  getCourses(): Course[] {
    return FORMATION_COURSES.map((c) => ({
      ...c,
      topics: [...c.topics],
      progress: this.getCourseProgressPercent(c.id),
    }));
  }

  getCourseById(id: string): Course | undefined {
    const base = FORMATION_COURSES.find((c) => c.id === id);
    if (!base) {
      return undefined;
    }
    return {
      ...base,
      topics: [...base.topics],
      progress: this.getCourseProgressPercent(id),
    };
  }

  isCourseUnlocked(courseId: string): boolean {
    const course = FORMATION_COURSES.find((c) => c.id === courseId);
    if (!course?.unlockRule) {
      return true;
    }
    const reqProgress = this.getCourseProgressPercent(course.unlockRule.requiresCourseId);
    return reqProgress >= course.unlockRule.minProgressPercent;
  }

  getUnlockMessage(courseId: string): string | undefined {
    return FORMATION_COURSES.find((c) => c.id === courseId)?.unlockRule?.message;
  }

  getLessonsForCourse(courseId: string): Lesson[] {
    return FORMATION_LESSONS.filter((l) => l.courseId === courseId).sort((a, b) => a.order - b.order);
  }

  getLessonById(lessonId: string): Lesson | undefined {
    return FORMATION_LESSONS.find((l) => l.id === lessonId);
  }

  getLessonStatus(courseId: string, lesson: Lesson): LessonStatus {
    if (!this.isCourseUnlocked(courseId)) {
      return 'LOCKED';
    }
    if (this.state.completedLessonIds.includes(lesson.id)) {
      return 'COMPLETED';
    }
    const lessons = this.getLessonsForCourse(courseId);
    const firstIncomplete = lessons.find((l) => !this.state.completedLessonIds.includes(l.id));
    if (firstIncomplete?.id === lesson.id) {
      return 'CURRENT';
    }
    if (firstIncomplete && lesson.order > firstIncomplete.order) {
      return 'LOCKED';
    }
    return 'CURRENT';
  }

  getCurrentLessonId(courseId: string): string | undefined {
    if (!this.isCourseUnlocked(courseId)) {
      return undefined;
    }
    const lessons = this.getLessonsForCourse(courseId);
    const current = lessons.find((l) => this.getLessonStatus(courseId, l) === 'CURRENT');
    return current?.id ?? lessons[0]?.id;
  }

  completeLesson(lessonId: string): boolean {
    const lesson = this.getLessonById(lessonId);
    if (!lesson || this.state.completedLessonIds.includes(lessonId)) {
      return false;
    }
    if (this.getLessonStatus(lesson.courseId, lesson) === 'LOCKED') {
      return false;
    }
    this.state.completedLessonIds.push(lessonId);
    this.state.activityLog.unshift({
      id: `act-${Date.now()}`,
      dateLabel: "Aujourd'hui",
      title: `+${LESSON_XP} XP`,
      subtitle: `Leçon « ${lesson.title} » complétée`,
      xpDelta: LESSON_XP,
      kind: 'lesson',
    });
    this.persist();
    return true;
  }

  getTotalXp(): number {
    const lessonXp = this.state.completedLessonIds.length * LESSON_XP;
    const quizXp = this.state.quizAttempts.reduce((s, a) => s + a.xpEarned, 0);
    return lessonXp + quizXp;
  }

  getLevelProgressPercent(): number {
    const level = this.getLearnerLevel();
    const prev = LEVEL_THRESHOLDS.find((l) => l.level === level.level)?.minXp ?? 0;
    const span = level.xpForNext - prev;
    if (span <= 0) {
      return 100;
    }
    return Math.min(100, Math.round(((level.currentXp - prev) / span) * 100));
  }

  isCourseLocked(courseId: string): boolean {
    return !this.isCourseUnlocked(courseId);
  }

  getLearnerLevel(): LearnerLevel {
    const xp = this.getTotalXp();
    const current = [...LEVEL_THRESHOLDS].reverse().find((l) => xp >= l.minXp) ?? LEVEL_THRESHOLDS[0];
    const next = LEVEL_THRESHOLDS.find((l) => l.level === current.level + 1);
    return {
      level: current.level,
      title: current.title,
      currentXp: xp,
      xpForNext: next?.minXp ?? current.maxXp + 1,
      nextTitle: next?.title ?? 'Max niveau',
    };
  }

  getGlobalStats(): FormationGlobalStats {
    const courses = this.getCourses();
    const unlocked = courses.filter((c) => this.isCourseUnlocked(c.id));
    const modulesCompleted = unlocked.filter((c) => c.progress >= 100).length;
    const avgProgress =
      unlocked.length === 0
        ? 0
        : Math.round(unlocked.reduce((s, c) => s + c.progress, 0) / unlocked.length);
    const passedQuizzes = new Set(
      this.state.quizAttempts.filter((a) => a.passed).map((a) => a.quizId),
    );
    const scores = this.state.quizAttempts.map((a) => Math.round((a.score / a.total) * 100));
    const averageQuizScore =
      scores.length === 0 ? 0 : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return {
      globalProgressPercent: avgProgress,
      modulesCompleted,
      modulesTotal: FORMATION_COURSES.length,
      quizzesPassed: passedQuizzes.size,
      xpTotal: this.getTotalXp(),
      lessonsCompleted: this.state.completedLessonIds.length,
      averageQuizScore,
      learningTimeMinutes: this.state.completedLessonIds.length * 25 + this.state.quizAttempts.length * 12,
      currentStreakDays: 5,
    };
  }

  getContinueLearning(): ContinueLearningState | null {
    const courses = this.getCourses().filter((c) => this.isCourseUnlocked(c.id) && c.progress < 100);
    const sorted = [...courses].sort((a, b) => b.progress - a.progress);
    const course = sorted[0];
    if (!course) {
      return null;
    }
    const lessonId = this.getCurrentLessonId(course.id);
    const lesson = lessonId ? this.getLessonById(lessonId) : undefined;
    if (!lesson) {
      return null;
    }
    return {
      courseId: course.id,
      courseTitle: course.title,
      lessonId: lesson.id,
      lessonTitle: `Leçon ${lesson.order} : ${lesson.title}`,
      progressPercent: course.progress,
    };
  }

  getRecommendation(): LearningRecommendation {
    const ta = this.getCourseProgressPercent('technical-analysis');
    if (ta >= 50 && ta < 100) {
      return {
        message:
          'Vous avez terminé ' +
          ta +
          ' % du parcours Analyse Technique. Terminez RSI et MACD pour débloquer Trading Avancé.',
        courseId: 'technical-analysis',
        lessonId: 'technical-analysis-l5',
      };
    }
    const trading = this.getCourseProgressPercent('trading-basics');
    if (trading < 50) {
      return {
        message:
          'Atteignez 50 % du module Trading pour débloquer Gestion des Risques. Continuez avec les ordres Stop et le carnet d’ordres.',
        courseId: 'trading-basics',
      };
    }
    return {
      message:
        'Excellent rythme ! Passez le quiz Analyse Technique pour consolider vos acquis avant le laboratoire pratique.',
      courseId: 'technical-analysis',
    };
  }

  getQuizzes(): Quiz[] {
    return FORMATION_QUIZZES.map((q) => ({
      ...q,
      questions: q.questions.map((x) => ({ ...x, options: [...x.options] })),
    }));
  }

  getQuizById(id: string): Quiz | undefined {
    const quiz = FORMATION_QUIZZES.find((q) => q.id === id);
    if (!quiz) {
      return undefined;
    }
    return {
      ...quiz,
      questions: quiz.questions.map((x) => ({ ...x, options: [...x.options] })),
    };
  }

  getBestQuizAttempt(quizId: string): QuizAttempt | undefined {
    const attempts = this.state.quizAttempts.filter((a) => a.quizId === quizId);
    if (attempts.length === 0) {
      return undefined;
    }
    return [...attempts].sort((a, b) => b.score / b.total - a.score / a.total)[0];
  }

  getRecentQuizAttempts(limit = 5): QuizAttempt[] {
    return [...this.state.quizAttempts]
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, limit);
  }

  startQuizSession(quizId: string): void {
    this.lastQuizSession = {
      quizId,
      answers: {},
      markedForReview: [],
      startedAt: Date.now(),
    };
    this.lastQuizResult = null;
  }

  toggleMarkQuestion(quizId: string, questionId: string): void {
    if (!this.lastQuizSession || this.lastQuizSession.quizId !== quizId) {
      return;
    }
    const set = new Set(this.lastQuizSession.markedForReview);
    if (set.has(questionId)) {
      set.delete(questionId);
    } else {
      set.add(questionId);
    }
    this.lastQuizSession.markedForReview = [...set];
  }

  submitQuiz(quizId: string, answers: Record<string, number>): QuizAttempt | null {
    const quiz = this.getQuizById(quizId);
    if (!quiz) {
      return null;
    }
    let score = 0;
    quiz.questions.forEach((q) => {
      if (answers[q.id] === q.correctIndex) {
        score++;
      }
    });
    const total = quiz.questions.length;
    const percent = Math.round((score / total) * 100);
    const passed = percent >= quiz.passingScore;
    const durationSeconds = this.lastQuizSession
      ? Math.round((Date.now() - this.lastQuizSession.startedAt) / 1000)
      : 0;
    const attempt: QuizAttempt = {
      quizId,
      score,
      total,
      passed,
      xpEarned: passed ? quiz.xpReward : Math.round(quiz.xpReward * 0.25),
      answers: { ...answers },
      completedAt: new Date().toISOString(),
      durationSeconds,
    };
    this.state.quizAttempts.push(attempt);
    this.state.activityLog.unshift({
      id: `quiz-${Date.now()}`,
      dateLabel: "Aujourd'hui",
      title: `Quiz ${quiz.title}`,
      subtitle: `Score ${percent} %`,
      xpDelta: attempt.xpEarned,
      kind: 'quiz',
    });
    this.lastQuizResult = attempt;
    this.persist();
    return attempt;
  }

  getSkillProgress(): SkillProgress[] {
    const map: Record<string, string> = {
      'crypto-fundamentals': 'Crypto Fundamentals',
      'trading-basics': 'Trading',
      'technical-analysis': 'Technical Analysis',
      'risk-management': 'Risk Management',
      'advanced-trading': 'Advanced Trading',
      'ai-trading': 'AI & Trading',
    };
    return FORMATION_COURSES.map((c) => ({
      id: c.id,
      label: map[c.id] ?? c.title,
      percent: this.getCourseProgressPercent(c.id),
    }));
  }

  getAchievements(): Achievement[] {
    const courses = this.getCourses();
    const passedCount = new Set(this.state.quizAttempts.filter((a) => a.passed).map((a) => a.quizId)).size;
    return [
      {
        id: 'explorer',
        title: 'Crypto Explorer',
        description: 'Terminer Fondamentaux Crypto',
        unlocked: this.getCourseProgressPercent('crypto-fundamentals') >= 100,
        progress: this.getCourseProgressPercent('crypto-fundamentals'),
        icon: 'explorer',
      },
      {
        id: 'quiz-master',
        title: 'Quiz Master',
        description: 'Réussir 5 quiz',
        unlocked: passedCount >= 5,
        progress: Math.min(100, Math.round((passedCount / 5) * 100)),
        icon: 'quiz',
      },
      {
        id: 'technical-analyst',
        title: 'Technical Analyst',
        description: 'Terminer Analyse Technique',
        unlocked: this.getCourseProgressPercent('technical-analysis') >= 100,
        progress: this.getCourseProgressPercent('technical-analysis'),
        icon: 'technical',
      },
      {
        id: 'risk-guardian',
        title: 'Risk Guardian',
        description: 'Terminer Gestion des Risques',
        unlocked: this.getCourseProgressPercent('risk-management') >= 100,
        progress: this.getCourseProgressPercent('risk-management'),
        icon: 'risk',
      },
      {
        id: 'ai-trader',
        title: 'AI Trader',
        description: 'Terminer IA & Trading',
        unlocked: this.getCourseProgressPercent('ai-trading') >= 100,
        progress: this.getCourseProgressPercent('ai-trading'),
        icon: 'ai',
      },
      {
        id: 'first-trade',
        title: 'Premier Trade',
        description: 'Compléter le labo Limit Order',
        unlocked: this.state.completedLessonIds.includes('trading-basics-l2'),
        progress: this.state.completedLessonIds.includes('trading-basics-l2') ? 100 : 0,
        icon: 'trade',
      },
    ];
  }

  getActivityLog(): LearningActivity[] {
    return [...this.state.activityLog];
  }

  getWeeklyActivity(): { categories: string[]; minutes: number[]; xp: number[] } {
    return {
      categories: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
      minutes: [45, 60, 30, 90, 75, 20, 55],
      xp: [60, 80, 40, 120, 100, 30, 70],
    };
  }

  formatDurationMinutes(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) {
      return `${m} min`;
    }
    return `${h} h ${m.toString().padStart(2, '0')} min`;
  }

  formatSeconds(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  private getCourseProgressPercent(courseId: string): number {
    const lessons = this.getLessonsForCourse(courseId);
    if (lessons.length === 0) {
      return 0;
    }
    const done = lessons.filter((l) => this.state.completedLessonIds.includes(l.id)).length;
    return Math.round((done / lessons.length) * 100);
  }

  estCertifieActuaire(): boolean {
    const coursActuariat = [
      'actuariat-tarification', 
      'actuariat-provisionnement', 
      'actuariat-parametrique', 
      'actuariat-mode-assureur'
    ];
    return coursActuariat.every(id => this.getCourseProgressPercent(id) >= 100);
  }

}
