import { useState, useEffect, useCallback } from 'react';

/**
 * Generic data fetching hook.
 * @param {Function} fetchFn - async function returning data
 * @param {Array} deps - dependency array (re-runs when deps change)
 * @param {*} fallback - returned when data is null or fetch fails
 */
export function useAPI(fetchFn, deps = [], fallback = null) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (e) {
      setError(e?.message || 'Failed to load data');
      setData(fallback);
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refetch: run };
}
