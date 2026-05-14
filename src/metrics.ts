import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

// 조리 시작 시도 횟수
export const kitchenStartTotal = new Counter({
  name: 'kitchen_start_total',
  help: 'Total kitchen /start attempts',
  labelNames: ['result'] as const,
  registers: [registry],
});

// 조리 완료 시도 횟수 (멱등성 가드로 인한 skipped 포함)
export const kitchenCompleteTotal = new Counter({
  name: 'kitchen_complete_total',
  help: 'Total kitchen /complete attempts',
  labelNames: ['result'] as const,
  registers: [registry],
});

// 조리 소요시간 (cook_finished_at - cook_started_at)
// 버킷: 1m / 2m / 3m / 5m / 10m / 20m — 포트폴리오 임계값(3분) 기준 분포 보기
export const cookDurationSeconds = new Histogram({
  name: 'cook_duration_seconds',
  help: 'Cooking duration from cook_started_at to cook_finished_at',
  buckets: [60, 120, 180, 300, 600, 1200],
  registers: [registry],
});
