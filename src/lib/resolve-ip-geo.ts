export interface IpGeo {
  country: string | null;
  city: string | null;
}

const LOCAL_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export async function resolveIpGeo(ip: string | null): Promise<IpGeo> {
  if (!ip || LOCAL_IPS.has(ip)) return { country: null, city: null };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) return { country: null, city: null };

    const data = (await res.json()) as {
      status: string;
      country?: string;
      city?: string;
    };

    if (data.status !== "success") return { country: null, city: null };

    return {
      country: data.country ?? null,
      city: data.city ?? null,
    };
  } catch {
    return { country: null, city: null };
  }
}

export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return headers.get("x-real-ip");
}
