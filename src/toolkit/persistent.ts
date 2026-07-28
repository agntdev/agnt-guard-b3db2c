/**
 * Small Redis-backed record store for durable domain data.  Callers own their
 * indexes; this deliberately has no list/scan operation.
 */
export interface PersistentStore {
  available(): boolean;
  read<T>(key: string): Promise<T | undefined>;
  write<T>(key: string, value: T): Promise<boolean>;
}

interface RedisRecordClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

interface DurableRecordStub {
  fetch(input: string, init?: { method?: string; body?: string }): Promise<Response>;
}
interface DurableRecordNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableRecordStub;
}

let clientPromise: Promise<RedisRecordClient | undefined> | undefined;
let durableNamespace: DurableRecordNamespace | undefined;

/** Called by the Worker entry to use its existing per-chat Durable Object. */
export function configurePersistentDurableStore(namespace: DurableRecordNamespace | undefined): void {
  durableNamespace = namespace;
}

function redisClient(): Promise<RedisRecordClient | undefined> {
  if (clientPromise) return clientPromise;
  const url = typeof process === "undefined" ? undefined : process.env.REDIS_URL;
  clientPromise = (async () => {
    if (!url) return undefined;
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    // ioredis is already a toolkit dependency for durable sessions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = require("ioredis");
    const Redis = mod.default ?? mod.Redis ?? mod;
    return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false }) as RedisRecordClient;
  })().catch(() => undefined);
  return clientPromise;
}

/** One shared client, but never an in-memory fallback for domain records. */
export function persistentStore(prefix = "groupguard:"): PersistentStore {
  return {
    available: () => Boolean(durableNamespace) || (typeof process !== "undefined" && Boolean(process.env.REDIS_URL)),
    async read<T>(key: string): Promise<T | undefined> {
      if (durableNamespace) {
        try {
          const stub = durableNamespace.get(durableNamespace.idFromName(prefix + key));
          const response = await stub.fetch("https://do/record", { method: "GET" });
          return response.status === 204 ? undefined : await response.json() as T;
        } catch { return undefined; }
      }
      const client = await redisClient();
      if (!client) return undefined;
      const raw = await client.get(prefix + key);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    },
    async write<T>(key: string, value: T): Promise<boolean> {
      if (durableNamespace) {
        try {
          const stub = durableNamespace.get(durableNamespace.idFromName(prefix + key));
          const response = await stub.fetch("https://do/record", { method: "PUT", body: JSON.stringify(value) });
          return response.ok;
        } catch { return false; }
      }
      const client = await redisClient();
      if (!client) return false;
      await client.set(prefix + key, JSON.stringify(value));
      return true;
    },
  };
}
