import { useState, useEffect } from 'react';

interface DnrPrice {
  price_dnr_usd: number;
  loading: boolean;
  error: boolean;
}

// Proxy through our own relayer — avoids CORS block from browser calling dex.kortana.xyz directly
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://jupiter-project-2isy.onrender.com';
const PRICE_ENDPOINT = `${BACKEND_URL}/api/dnr-price`;

const FALLBACK_PRICE = 1242.27; // Last known price
const REFRESH_INTERVAL_MS = 30_000;

let cachedPrice: number | null = null;
let cacheTimestamp = 0;

export function useLiveDnrPrice(): DnrPrice {
  const [price, setPrice] = useState<number>(FALLBACK_PRICE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchPrice = async () => {
      // Serve from in-memory cache if still fresh (avoids redundant requests on re-renders)
      if (cachedPrice !== null && Date.now() - cacheTimestamp < REFRESH_INTERVAL_MS) {
        setPrice(cachedPrice);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(PRICE_ENDPOINT);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (json.success && json.price_dnr_usd) {
          const parsed = parseFloat(json.price_dnr_usd);
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

    const interval = setInterval(fetchPrice, REFRESH_INTERVAL_MS);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { price_dnr_usd: price, loading, error };
}
