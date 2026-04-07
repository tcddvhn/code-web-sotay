import { createClient, type AuthChangeEvent, type Session, type User as SupabaseUser } from '@supabase/supabase-js';
import { AuthenticatedUser } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://taivkgwwinakcoxhquyv.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_yhIJUroRXhTStoBOzApNKg_Gk7EVjC5';
const SUPABASE_BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'uploads';
const SUPABASE_ROOT_FOLDER = import.meta.env.VITE_SUPABASE_ROOT_FOLDER || 'app_data';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

function mapSupabaseUser(user: SupabaseUser | null | undefined): AuthenticatedUser | null {
  if (!user) {
    return null;
  }

  const metadata = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email || null,
    displayName: metadata.display_name || metadata.name || null,
    photoURL: metadata.avatar_url || metadata.picture || null,
    unitCode: metadata.unit_code || null,
    unitName: metadata.unit_name || null,
  };
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function joinStoragePath(...parts: string[]) {
  return parts
    .map((part) => part.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function stripRootFolderPrefix(path: string) {
  const normalizedPath = path.trim().replace(/^\/+|\/+$/g, '');
  const rootPrefix = `${SUPABASE_ROOT_FOLDER}/`;

  if (normalizedPath === SUPABASE_ROOT_FOLDER) {
    return '';
  }

  if (normalizedPath.startsWith(rootPrefix)) {
    return normalizedPath.slice(rootPrefix.length);
  }

  return normalizedPath;
}

function buildStoragePathCandidates(path: string) {
  const normalizedPath = path.trim().replace(/^\/+|\/+$/g, '');
  if (!normalizedPath) {
    return [];
  }

  const withoutRoot = stripRootFolderPrefix(normalizedPath);
  return Array.from(
    new Set(
      [
        normalizedPath,
        withoutRoot,
        joinStoragePath(SUPABASE_ROOT_FOLDER, withoutRoot),
      ].filter(Boolean),
    ),
  );
}

export async function loginWithSupabaseEmail(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error('Vui lòng nhập đầy đủ email và mật khẩu.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new Error(error.message || 'Không thể đăng nhập Supabase bằng email/mật khẩu.');
  }

  return data;
}

export async function updateSupabasePassword(newPassword: string) {
  const password = newPassword.trim();
  if (!password) {
    throw new Error('Vui lòng nhập mật khẩu mới.');
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    throw new Error(error.message || 'Không thể cập nhật mật khẩu.');
  }
}

export async function ensureSupabaseSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Bạn chưa đăng nhập Supabase. Hãy đăng nhập bằng email/mật khẩu trước khi tải file.');
  }

  return session;
}

export async function getCurrentSupabaseUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return mapSupabaseUser(session?.user);
}

export function onSupabaseAuthStateChange(callback: (user: AuthenticatedUser | null, session: Session | null, event: AuthChangeEvent) => void) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(mapSupabaseUser(session?.user), session, event);
  });

  return () => subscription.unsubscribe();
}

export async function uploadFile(
  file: File | Blob,
  options?: {
    folder?: string;
    fileName?: string;
    contentType?: string;
    upsert?: boolean;
  },
) {
  if (!file) {
    throw new Error('Không có file để tải lên.');
  }

  await ensureSupabaseSession();

  const originalName = file instanceof File ? file.name : options?.fileName || 'upload.bin';
  const safeFileName = sanitizeFileName(options?.fileName || originalName || 'upload.bin');
  const relativeFolder = options?.folder ? joinStoragePath(stripRootFolderPrefix(options.folder)) : '';
  const filePath = joinStoragePath(
    SUPABASE_ROOT_FOLDER,
    relativeFolder,
    `${Date.now()}_${safeFileName}`,
  );

  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: options?.upsert ?? false,
      contentType: options?.contentType || (file instanceof File ? file.type : undefined) || 'application/octet-stream',
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Tải file lên Supabase Storage thất bại.');
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath);

  return {
    bucket: SUPABASE_BUCKET,
    path: filePath,
    publicUrl,
  };
}

export async function deleteFileByPath(storagePath: string) {
  const candidates = buildStoragePathCandidates(storagePath);
  if (candidates.length === 0) {
    return;
  }

  await ensureSupabaseSession();

  const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove(candidates);

  if (error) {
    throw new Error(error.message || 'Không thể xóa file trên Supabase Storage.');
  }
}

async function listFilesRecursively(prefix: string, accumulator: string[]) {
  const normalizedPrefix = prefix.trim().replace(/^\/+|\/+$/g, '');
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).list(normalizedPrefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) {
    throw new Error(error.message || `Không thể đọc thư mục ${normalizedPrefix} trên Supabase Storage.`);
  }

  for (const entry of data || []) {
    const nextPath = joinStoragePath(normalizedPrefix, entry.name);
    const isFolder = !entry.metadata;

    if (isFolder) {
      await listFilesRecursively(nextPath, accumulator);
    } else {
      accumulator.push(nextPath);
    }
  }
}

export async function deleteFolderByPath(storagePath: string) {
  const candidates = buildStoragePathCandidates(storagePath);
  if (candidates.length === 0) {
    return;
  }

  await ensureSupabaseSession();

  for (const candidate of candidates) {
    const filesToDelete: string[] = [];
    try {
      await listFilesRecursively(candidate, filesToDelete);
    } catch {
      continue;
    }

    if (filesToDelete.length === 0) {
      continue;
    }

    for (let index = 0; index < filesToDelete.length; index += 100) {
      const chunk = filesToDelete.slice(index, index + 100);
      const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove(chunk);
      if (error) {
        throw new Error(error.message || `Không thể xóa thư mục ${candidate} trên Supabase Storage.`);
      }
    }

    return;
  }
}

export function getPublicUrlByPath(storagePath: string) {
  const candidates = buildStoragePathCandidates(storagePath);
  const targetPath = candidates[0];

  if (!targetPath) {
    return '';
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(targetPath);

  return publicUrl;
}

export async function logoutSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message || 'Không thể đăng xuất Supabase.');
  }
}
