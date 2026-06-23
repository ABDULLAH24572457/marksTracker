export type UserRole = 'ADMIN' | 'DATA_ENTRY';

export type Committee = {
  id: string;
  name: string;
  weightPercentage: string | number;
  createdAt?: string;
  updatedAt?: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  committeeId: string | null;
  committee: Pick<Committee, 'id' | 'name'> | null;
};

export type User = AuthUser & {
  createdAt: string;
  updatedAt: string;
};

export type Stage = {
  id: string;
  name: string;
};

export type Family = {
  id: string;
  name: string;
  stageId: string;
  stage: Stage;
};

export type Criterion = {
  id: string;
  title: string;
  description: string | null;
  maxScore: string | number;
  displayOrder: number;
  committeeId: string;
  committee: Pick<Committee, 'id' | 'name'>;
};

export type Score = {
  id: string;
  scoringCycleId: string;
  familyId: string;
  criterionId: string;
  score: string | number;
  scoringCycle: {
    id: string;
    name: string;
    status: string;
  };
  family: Family;
  criterion: Criterion & {
    committee: Pick<Committee, 'id' | 'name'>;
  };
};

export type CommitteeBreakdown = {
  committeeId: string;
  committeeName: string;
  earnedScore: number;
  maxPossibleScore: number;
  weightPercentage: number;
  weightedScore: number;
};

export type Ranking = {
  familyId: string;
  familyName: string;
  stageId: string;
  stageName: string;
  totalScore: number;
  rank: number;
  overallRank: number;
  committeeBreakdown: CommitteeBreakdown[];
};

export type ScoreContext = {
  scoringCycle: {
    id: string;
    name: string;
    status: string;
  };
  families: Family[];
  criteria: Criterion[];
};
