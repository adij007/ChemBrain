import { z } from "zod";

/** Express query values may be string | string[] */
const queryString = z.preprocess((v) => {
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}, z.string().optional());

/** Shared contract for GET /api/research/candidates query parameters */
export const candidateListQuerySchema = z.object({
  q: queryString,
  disease: queryString,
  target: queryString,
  mechanism: queryString,
  minConfidence: z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    const s = Array.isArray(v) ? v[0] : v;
    return Number(s);
  }, z.number().optional()),
  riskLevels: queryString,
});

export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;
