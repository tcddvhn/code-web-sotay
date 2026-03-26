import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://taivkgwwinakcoxhquyv.supabase.com';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_yhIJUroRXhTStoBOzApNKg_Gk7EVjC5';
const SUPABASE_BUCKET = 'uploads';
const SUPABASE_ROOT_FOLDER = 'app_data';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

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

export async function signUpWithSupabaseEmail(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error('Vui lòng nhập đầy đủ email và mật khẩu.');
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new Error(error.message || 'Không thể tạo tài khoản Supabase.');
  }

  return data;
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
  const relativeFolder = options?.folder ? joinStoragePath(options.folder) : '';
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
  const normalizedPath = storagePath.trim().replace(/^\/+|\/+$/g, '');
  if (!normalizedPath) {
    return;
  }

  await ensureSupabaseSession();

  const { error } = await supabase.storage.from(SUPABASE_BUCKET).remove([normalizedPath]);

  if (error) {
    throw new Error(error.message || 'Không thể xóa file trên Supabase Storage.');
  }
}

export async function logoutSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message || 'Không thể đăng xuất Supabase.');
  }
}
