import client from './client';
export const getBlocks = (params) => client.get('/blocks', { params }).then(r => r.data);
export const createBlock = (data, opts) => client.post('/blocks', data, { params: opts?.force ? { force: true } : undefined }).then(r => r.data);
export const checkConflict = (data) => client.post('/blocks/check-conflict', data).then(r => r.data);
export const getConflicts = () => client.get('/blocks/conflicts').then(r => r.data);
export const parseBlockRequest = (text) => client.post('/blocks/parse-request', { text }).then(r => r.data);
export const getParseModelInfo = () => client.get('/blocks/parse-model-info').then(r => r.data);

/**
 * Create a block, and if it collides with an existing one (409), shift the
 * suggested window forward in `stepHours` increments and retry — used by
 * the AI-recommendation "Accept" / "Schedule Preventive Block" buttons,
 * which don't have a human in the loop to manually pick a different time.
 * Throws with a clear message if no clear slot is found within the day.
 */
export async function createBlockSafely(block, { maxAttempts = 4, stepHours = 2 } = {}) {
  let attempt = { ...block };
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await createBlock(attempt);
    } catch (err) {
      if (err?.response?.status !== 409) throw err;
      const duration = attempt.end_hour - attempt.start_hour;
      const nextStart = attempt.start_hour + stepHours;
      if (nextStart + duration > 24) {
        throw new Error(`No free window found on ${block.section} today — try Block Planner to pick a day manually.`);
      }
      attempt = { ...attempt, start_hour: nextStart, end_hour: nextStart + duration };
    }
  }
  throw new Error(`Could not find a free window on ${block.section} after ${maxAttempts} attempts.`);
}
