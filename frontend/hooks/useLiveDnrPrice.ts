import { useState, useEffect } from 'react';

interface DnrPrice {
  price_dnr_usd: number;
  loading: boolean;
  error: boolean;
}

const DNR_STATS_URL = 'https://dex.kortana.xyz/api/stats';
const FALLBACK_PRICE = 1242.27; // Last known price as fallback
const CACHE_TTL_MS = 30_000; // Re-fetch every 30 seconds

let cachedPrice: number | null = null;
let cacheTimestamp = 0;

export function useLiveDnrPrice(): DnrPrice {
  const [price, setPrice] = useState<number>(FALLBACK_PRICE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchPrice = async () => {
      // Use cached value if still fresh
      if (cachedPrice !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
        setPrice(cachedPrice);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(DNR_STATS_URL);
        const json = await res.json();
        if (json.success && json.data?.price_dnr_usd) {
          const parsed = parseFloat(json.data.price_dnr_usd);
          cachedPrice = parsed;
          cacheTimestamp = Date.now();
          if (isMounted) {
            setPrice(parsed);
            setError(false);
          }
        } else {
          throw new Error('Invalid response');
        }
      } catch (e) {
        console.warn('[Jupiter] DNR price fetch failed, using fallback:', e);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPrice();

    // Refresh price every 30 seconds
    const interval = setInterval(fetchPrice, CACHE_TTL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { price_dnr_usd: price, loading, error };
}
