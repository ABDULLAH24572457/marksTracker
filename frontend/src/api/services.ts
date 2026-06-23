import { api } from './client';
import type {
  AuthUser,
  Committee,
  Criterion,
  Family,
  Ranking,
  Score,
  ScoreContext,
  User,
  UserRole,
} from '../types';

export const authApi = {
  login: async (email: string, password: string) => {
    const { data } = await api.post<{
      accessToken: string;
      user: AuthUser;
    }>('/auth/login', { email, password });
    return data;
  },
  me: async () => {
    const { data } = await api.get<AuthUser>('/auth/me');
    return data;
  },
};

export type UserInput = {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  committeeId: string | null;
};

export const usersApi = {
  list: async () => (await api.get<User[]>('/users')).data,
  create: async (input: UserInput & { password: string }) =>
    (await api.post<User>('/users', input)).data,
  update: async (id: string, input: Partial<UserInput>) =>
    (await api.patch<User>(`/users/${id}`, input)).data,
  remove: async (id: string) => api.delete(`/users/${id}`),
};

export type CommitteeInput = {
  name: string;
  weightPercentage: number;
  isLocked?: boolean;
};

export const committeesApi = {
  list: async () => (await api.get<Committee[]>('/committees')).data,
  create: async (input: CommitteeInput) =>
    (await api.post<Committee>('/committees', input)).data,
  update: async (id: string, input: Partial<CommitteeInput>) =>
    (await api.patch<Committee>(`/committees/${id}`, input)).data,
  remove: async (id: string) => api.delete(`/committees/${id}`),
};

export type CriterionInput = {
  title: string;
  description?: string | null;
  maxScore: number;
  committeeId: string;
  displayOrder?: number;
};

export const criteriaApi = {
  list: async () => (await api.get<Criterion[]>('/criteria')).data,
  create: async (input: CriterionInput) =>
    (await api.post<Criterion>('/criteria', input)).data,
  update: async (id: string, input: Partial<CriterionInput>) =>
    (await api.patch<Criterion>(`/criteria/${id}`, input)).data,
  remove: async (id: string) => api.delete(`/criteria/${id}`),
};

export const familiesApi = {
  list: async () => (await api.get<Family[]>('/families')).data,
  create: async (input: { name: string; stageId: string }) =>
    (await api.post<Family>('/families', input)).data,
  update: async (
    id: string,
    input: Partial<{ name: string; stageId: string }>,
  ) => (await api.patch<Family>(`/families/${id}`, input)).data,
  remove: async (id: string) => api.delete(`/families/${id}`),
};

export type ScoreInput = {
  scoringCycleId: string;
  familyId: string;
  criterionId: string;
  score: number;
};

export const scoresApi = {
  list: async () => (await api.get<Score[]>('/scores')).data,
  context: async () => (await api.get<ScoreContext>('/scores/context')).data,
  reset: async () =>
    (
      await api.post<{
        message: string;
        deletedCount: number;
      }>('/scores/reset')
    ).data,
  create: async (input: ScoreInput) =>
    (await api.post<Score>('/scores', input)).data,
  update: async (id: string, input: Partial<ScoreInput>) =>
    (await api.patch<Score>(`/scores/${id}`, input)).data,
  remove: async (id: string) => api.delete(`/scores/${id}`),
};

export const rankingsApi = {
  list: async () => (await api.get<Ranking[]>('/rankings')).data,
};

export const reportsApi = {
  downloadDetailedResultsPdf: async () =>
    (
      await api.get<Blob>('/reports/final-results/pdf', {
        responseType: 'blob',
      })
    ).data,
};
