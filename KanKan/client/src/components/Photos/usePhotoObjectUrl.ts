import { useEffect, useState } from 'react';
import { photoService } from '@/services/photo.service';

type ObjectUrlCacheEntry = {
  objectUrl?: string;
  promise?: Promise<string | null>;
};

const photoObjectUrlCache = new Map<string, ObjectUrlCacheEntry>();

async function getOrLoadPhotoObjectUrl(photoId: string): Promise<string | null> {
  const cached = photoObjectUrlCache.get(photoId);
  if (cached?.objectUrl) {
    return cached.objectUrl;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = photoService.downloadBlob(photoId)
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      photoObjectUrlCache.set(photoId, { objectUrl });
      return objectUrl;
    })
    .catch((error) => {
      photoObjectUrlCache.delete(photoId);
      throw error;
    });

  photoObjectUrlCache.set(photoId, { promise });
  return promise;
}

export function invalidatePhotoObjectUrl(photoId?: string | null) {
  if (!photoId) {
    photoObjectUrlCache.forEach((entry) => {
      if (entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
      }
    });
    photoObjectUrlCache.clear();
    return;
  }

  const cached = photoObjectUrlCache.get(photoId);
  if (cached?.objectUrl) {
    URL.revokeObjectURL(cached.objectUrl);
  }
  photoObjectUrlCache.delete(photoId);
}

export function usePhotoObjectUrl(photoId?: string | null) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoId) {
      setObjectUrl(null);
      return;
    }

    let activeUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const nextUrl = await getOrLoadPhotoObjectUrl(photoId);

        if (cancelled || !nextUrl) {
          return;
        }

        activeUrl = nextUrl;
        setObjectUrl(nextUrl);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load photo preview:', error);
          setObjectUrl(null);
        }
      }
    };

    setObjectUrl(null);
    void load();

    return () => {
      cancelled = true;
    };
  }, [photoId]);

  return objectUrl;
}

export function usePhotoObjectUrls(photoIds: string[]) {
  const [objectUrls, setObjectUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (photoIds.length === 0) {
      setObjectUrls({});
      return;
    }

    const uniquePhotoIds = Array.from(new Set(photoIds.filter(Boolean)));
    let cancelled = false;
    const createdUrls: string[] = [];

    const load = async () => {
      try {
        const entries = await Promise.all(uniquePhotoIds.map(async (photoId) => {
          const objectUrl = await getOrLoadPhotoObjectUrl(photoId);
          if (objectUrl) {
            createdUrls.push(objectUrl);
          }
          return [photoId, objectUrl] as const;
        }));

        if (cancelled) {
          return;
        }

        setObjectUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load photo previews:', error);
          setObjectUrls({});
        }
      }
    };

    setObjectUrls({});
    void load();

    return () => {
      cancelled = true;
    };
  }, [photoIds.join('|')]);

  return objectUrls;
}