export type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type CourseFilterId =
  | 'ALL'
  | 'BEGINNER'
  | 'INTERMEDIATE'
  | 'ADVANCED'
  | 'COMPLETED'
  | 'IN_PROGRESS';

export type LessonStatus = 'COMPLETED' | 'CURRENT' | 'LOCKED';

export type CourseIconKey =
  | 'fundamentals'
  | 'trading'
  | 'technical'
  | 'risk'
  | 'advanced'
  | 'ai';

export interface Course {
  id: string;
  title: string;
  description: string;
  level: CourseLevel;
  levelLabel: string;
  category: string;
  topics: string[];
  durationMinutes: number;
  lessonsCount: number;
  progress: number;
  xpReward: number;
  iconKey: CourseIconKey;
  unlockRule?: CourseUnlockRule;
}

export interface CourseUnlockRule {
  requiresCourseId: string;
  minProgressPercent: number;
  message: string;
}

export interface LessonSection {
  title: string;
  body: string;
}

export interface PracticalMission {
  id: string;
  title: string;
  objective: string;
  tasks: { id: string; label: string }[];
  xpReward: number;
  tradingRoute: string;
  queryParams?: Record<string, string>;
}

export interface Lesson {
  id: string;
  courseId: string;
  order: number;
  title: string;
  durationMinutes: number;
  objective: string;
  sections: LessonSection[];
  conceptCard?: { title: string; body: string };
  practicalExample?: { title: string; body: string };
  takeaways: string[];
  knowledgeCheck?: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
  mission?: PracticalMission;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Quiz {
  id: string;
  courseId: string;
  title: string;
  moduleTitle: string;
  questionCount: number;
  durationMinutes: number;
  difficulty: CourseLevel;
  difficultyLabel: string;
  passingScore: number;
  xpReward: number;
  recommended?: boolean;
  questions: QuizQuestion[];
}

export interface QuizAttempt {
  quizId: string;
  score: number;
  total: number;
  passed: boolean;
  xpEarned: number;
  answers: Record<string, number>;
  completedAt: string;
  durationSeconds: number;
}

export interface FormationGlobalStats {
  globalProgressPercent: number;
  modulesCompleted: number;
  modulesTotal: number;
  quizzesPassed: number;
  xpTotal: number;
  lessonsCompleted: number;
  averageQuizScore: number;
  learningTimeMinutes: number;
  currentStreakDays: number;
}

export interface ContinueLearningState {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  progressPercent: number;
}

export interface SkillProgress {
  id: string;
  label: string;
  percent: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress?: number;
  icon: 'explorer' | 'quiz' | 'technical' | 'risk' | 'ai' | 'trade';
}

export interface LearningActivity {
  id: string;
  dateLabel: string;
  title: string;
  subtitle: string;
  xpDelta?: number;
  kind: 'lesson' | 'quiz' | 'module' | 'xp';
}

export interface LearnerLevel {
  level: number;
  title: string;
  currentXp: number;
  xpForNext: number;
  nextTitle: string;
}

export interface LearningRecommendation {
  message: string;
  courseId?: string;
  lessonId?: string;
}

export interface FormationStoredState {
  version: 1;
  completedLessonIds: string[];
  quizAttempts: QuizAttempt[];
  activityLog: LearningActivity[];
  seeded: boolean;
}
