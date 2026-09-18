export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface Space {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { projects: number };
}

export interface Project {
  id: string;
  spaceId: string;
  name: string;
  description: string | null;
  goal: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { materials: number };
  materials?: Material[];
  space?: { id: string; name: string };
}

export type MaterialStatus = "QUEUED" | "PROCESSING" | "READY" | "FAILED";

export interface Material {
  id: string;
  projectId: string;
  title: string;
  fileUrl: string;
  fileType: string;
  status: MaterialStatus;
  errorMessage: string | null;
  pageCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  projectId: string;
  title: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

export type MessageRole = "USER" | "ASSISTANT";

export interface Citation {
  material: string;
  page: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  citations: Citation[] | null;
  sufficientEvidence: boolean | null;
  createdAt: string;
}

export type QuestionType = "MCQ" | "OPEN";

export interface Concept {
  id: string;
  name: string;
  description: string | null;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  conceptId: string;
  concept?: Concept;
  type: QuestionType;
  difficulty: number;
  prompt: string;
  options: string[] | null;
  correctAnswer?: string; // only present once the question has been attempted
  createdAt: string;
  attempts?: QuizAttempt[];
}

export interface QuizAttemptFeedback {
  correct?: boolean;
  correctAnswer?: string;
  score?: number;
  understood?: string[];
  missing?: string[];
  feedbackText: string;
}

export interface QuizAttempt {
  id: string;
  quizQuestionId: string;
  answer: string;
  score: number | null;
  feedback: QuizAttemptFeedback | null;
  createdAt: string;
}

export interface Quiz {
  id: string;
  projectId: string;
  createdAt: string;
  completedAt: string | null;
  questions?: QuizQuestion[];
}

export interface MasteryUpdate {
  conceptId: string;
  newScore: number;
  evidenceCount: number;
}

export type MasteryTrend = "improving" | "stable" | "needs-attention" | "new" | "insufficient-data";

export interface ConceptMasteryOverview {
  conceptId: string;
  conceptName: string;
  latestScore: number;
  evidenceCount: number;
  trend: MasteryTrend;
  projectId?: string;
  projectName?: string;
}

export interface Recommendation {
  id: string;
  projectId: string;
  action: string;
  rationale: string;
  conceptId: string | null;
  dismissed: boolean;
  createdAt: string;
}

export interface ProjectAnalytics {
  lookbackDays: number;
  activityOverTime: { date: string; count: number }[];
  quizPerformance: { date: string; score: number }[];
  masteryDistribution: ConceptMasteryOverview[];
  aiUsage: {
    feature: string;
    status: "SUCCESS" | "FAILURE";
    count: number;
    avgLatencyMs: number | null;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number;
  }[];
}

export interface DashboardData {
  continueLearning: Project | null;
  recentProjects: Project[];
  overallProgress: {
    conceptsTracked: number;
    conceptsAssessed: number;
    averageScore: number | null;
    improving: number;
    needsAttention: number;
  };
  areasNeedingAttention: ConceptMasteryOverview[];
  recentRecommendations: { project: { id: string; name: string }; recommendation: Recommendation }[];
}
