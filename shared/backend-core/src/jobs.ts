export type GenerationJobRecord = {
  status: "generating" | "done" | "error";
  step: string;
  totalChunks: number;
  completedChunks: number;
  pack: unknown | null;
  error: string | null;
  debug: unknown | null;
};

export type JobPersistence = {
  load(jobId: string): Promise<GenerationJobRecord | null>;
  save(jobId: string, job: GenerationJobRecord): Promise<void>;
  remove(jobId: string): Promise<void>;
};

function cloneJob(job: GenerationJobRecord): GenerationJobRecord {
  return JSON.parse(JSON.stringify(job));
}

function persistLater(
  persistence: JobPersistence | null,
  jobId: string,
  job: GenerationJobRecord
) {
  if (!persistence) {
    return;
  }

  Promise.resolve()
    .then(() => persistence.save(jobId, cloneJob(job)))
    .catch((error) => {
      console.warn(`Failed to persist job ${jobId}:`, error?.message || error);
    });
}

function createProxyJob(
  persistence: JobPersistence | null,
  jobId: string,
  job: GenerationJobRecord
) {
  return new Proxy(job, {
    set(target, property, value) {
      (target as Record<string, unknown>)[String(property)] = value;
      persistLater(persistence, jobId, target);
      return true;
    },
  });
}

export function createSupabaseJobPersistence({
  fetchImpl = fetch,
  serviceRoleKey,
  supabaseUrl,
  tableName = "generation_jobs",
}: {
  fetchImpl?: typeof fetch;
  serviceRoleKey?: string;
  supabaseUrl?: string;
  tableName?: string;
}): JobPersistence | null {
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  const baseUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${tableName}`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  return {
    async load(jobId) {
      const response = await fetchImpl(
        `${baseUrl}?select=payload&id=eq.${encodeURIComponent(jobId)}`,
        {
          headers,
        }
      );

      if (!response.ok) {
        throw new Error(`Supabase job load failed: ${response.status}`);
      }

      const rows = (await response.json()) as Array<{ payload?: GenerationJobRecord }>;
      return rows[0]?.payload || null;
    },

    async save(jobId, job) {
      const response = await fetchImpl(baseUrl, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify([{ id: jobId, payload: job }]),
      });

      if (!response.ok) {
        throw new Error(`Supabase job save failed: ${response.status}`);
      }
    },

    async remove(jobId) {
      const response = await fetchImpl(`${baseUrl}?id=eq.${encodeURIComponent(jobId)}`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Supabase job delete failed: ${response.status}`);
      }
    },
  };
}

export function createKvJobPersistence(kv: {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
} | null): JobPersistence | null {
  if (!kv) {
    return null;
  }

  return {
    async load(jobId) {
      const raw = await kv.get(jobId);
      return raw ? (JSON.parse(raw) as GenerationJobRecord) : null;
    },
    async save(jobId, job) {
      await kv.put(jobId, JSON.stringify(job));
    },
    async remove(jobId) {
      await kv.delete(jobId);
    },
  };
}

export function createPersistentJobStore({
  persistence = null,
  ttlMs = 5 * 60 * 1000,
}: {
  persistence?: JobPersistence | null;
  ttlMs?: number;
} = {}) {
  const jobs = new Map<string, GenerationJobRecord>();

  async function create(jobId: string) {
    const job = createProxyJob(persistence, jobId, {
      status: "generating",
      step: "extracting",
      totalChunks: 0,
      completedChunks: 0,
      pack: null,
      error: null,
      debug: null,
    });
    jobs.set(jobId, job);
    if (persistence) {
      await persistence.save(jobId, cloneJob(job));
    }
    return job;
  }

  async function get(jobId: string) {
    const existing = jobs.get(jobId);
    if (existing) {
      return existing;
    }

    const loaded = await persistence?.load(jobId);
    if (!loaded) {
      return null;
    }

    const proxied = createProxyJob(persistence, jobId, loaded);
    jobs.set(jobId, proxied);
    return proxied;
  }

  async function remove(jobId: string) {
    jobs.delete(jobId);
    await persistence?.remove(jobId);
  }

  function scheduleCleanup(jobId: string) {
    if (!ttlMs || ttlMs <= 0) {
      return;
    }

    setTimeout(() => {
      remove(jobId).catch((error) => {
        console.warn(`Failed to cleanup job ${jobId}:`, error?.message || error);
      });
    }, ttlMs);
  }

  return {
    create,
    get,
    remove,
    scheduleCleanup,
  };
}
