import { createClient } from "@supabase/supabase-js";

export type SupabaseAudioStorageConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucketName: string;
};

export function resolveSupabaseAudioStorageConfig(raw: {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  bucketName?: string;
}) {
  const supabaseUrl = String(raw.supabaseUrl || "").trim();
  const serviceRoleKey = String(raw.serviceRoleKey || "").trim();
  const bucketName = String(raw.bucketName || "shorts-audio").trim() || "shorts-audio";

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    bucketName,
  } as SupabaseAudioStorageConfig;
}

export function createSupabaseAudioStorageClient(config: SupabaseAudioStorageConfig) {
  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  let ensureBucketPromise: Promise<void> | null = null;

  async function ensureBucket() {
    if (!ensureBucketPromise) {
      ensureBucketPromise = (async () => {
        const { data, error } = await client.storage.getBucket(config.bucketName);
        if (!error && data) {
          return;
        }

        const { error: createError } = await client.storage.createBucket(config.bucketName, {
          public: false,
          fileSizeLimit: "50MB",
        });

        if (
          createError &&
          !/already exists/i.test(createError.message || "") &&
          !/duplicate/i.test(createError.message || "")
        ) {
          throw createError;
        }
      })().catch((err) => {
        ensureBucketPromise = null;
        throw err;
      });
    }

    return ensureBucketPromise;
  }

  return {
    bucketName: config.bucketName,
    async uploadBinary(path: string, bytes: Uint8Array, contentType = "application/octet-stream") {
      await ensureBucket();
      const { error } = await client.storage.from(config.bucketName).upload(path, bytes, {
        upsert: true,
        contentType,
      });

      if (error) {
        throw error;
      }

      return {
        bucketName: config.bucketName,
        path,
      };
    },

    async uploadAudio(path: string, bytes: Uint8Array, contentType = "audio/mpeg") {
      return this.uploadBinary(path, bytes, contentType);
    },

    async createSignedUrl(path: string, expiresIn = 60 * 60) {
      const { data, error } = await client.storage.from(config.bucketName).createSignedUrl(path, expiresIn);
      if (error) {
        throw error;
      }

      return {
        bucketName: config.bucketName,
        path,
        signedUrl: data?.signedUrl || "",
      };
    },
  };
}
