import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_PASSWORD = 'btctuhn@456';

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeDisplayName(value: unknown, fallbackEmail: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return fallbackEmail;
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Chỉ hỗ trợ phương thức POST.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = request.headers.get('Authorization');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(500, { error: 'Thiếu biến môi trường Supabase cho Edge Function.' });
  }

  if (!authHeader) {
    return jsonResponse(401, { error: 'Thiếu thông tin xác thực để gọi Edge Function.' });
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user: callerUser },
    error: callerError,
  } = await callerClient.auth.getUser();

  if (callerError || !callerUser?.email) {
    return jsonResponse(401, { error: 'Không xác thực được người gọi Edge Function.' });
  }

  const callerEmail = normalizeEmail(callerUser.email);
  const { data: callerProfile, error: callerProfileError } = await adminClient
    .from('user_profiles')
    .select('email, role, is_active')
    .eq('email', callerEmail)
    .eq('is_active', true)
    .maybeSingle();

  if (callerProfileError) {
    return jsonResponse(500, { error: callerProfileError.message || 'Không thể kiểm tra quyền admin.' });
  }

  if (!callerProfile || callerProfile.role !== 'admin') {
    return jsonResponse(403, { error: 'Chỉ quản trị hệ thống mới được cấp tài khoản đăng nhập.' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Body request không hợp lệ.' });
  }

  const email = normalizeEmail(payload.email);
  const displayName = normalizeDisplayName(payload.displayName, email);
  const role = payload.role === 'admin' ? 'admin' : 'contributor';
  const createAuthUser = payload.createAuthUser !== false;

  if (!email) {
    return jsonResponse(400, { error: 'Email tài khoản nội bộ không hợp lệ.' });
  }

  const { data: existingProfile, error: existingProfileError } = await adminClient
    .from('user_profiles')
    .select('email, auth_user_id, must_change_password')
    .eq('email', email)
    .maybeSingle();

  if (existingProfileError) {
    return jsonResponse(500, { error: existingProfileError.message || 'Không thể đọc hồ sơ người dùng hiện tại.' });
  }

  let authUserId = existingProfile?.auth_user_id || null;
  let mustChangePassword = existingProfile?.must_change_password ?? false;
  let createdAuthUser = false;

  if (createAuthUser && !authUserId) {
    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
        name: displayName,
      },
    });

    if (createUserError) {
      const message = createUserError.message || 'Không thể tạo tài khoản Supabase Auth.';
      const normalizedMessage = message.toLowerCase();
      if (
        normalizedMessage.includes('already') ||
        normalizedMessage.includes('exists') ||
        normalizedMessage.includes('registered') ||
        normalizedMessage.includes('duplicate')
      ) {
        return jsonResponse(409, {
          error:
            'Email này đã có tài khoản đăng nhập trên Supabase Auth. Nếu cần tiếp tục, hãy reset mật khẩu trong Supabase Dashboard hoặc dùng email khác.',
        });
      }
      return jsonResponse(400, { error: message });
    }

    authUserId = createdUser.user?.id || null;
    mustChangePassword = true;
    createdAuthUser = true;
  }

  const { error: upsertProfileError } = await adminClient.from('user_profiles').upsert(
    {
      email,
      auth_user_id: authUserId,
      display_name: displayName,
      role,
      unit_code: null,
      unit_name: null,
      is_active: true,
      must_change_password: mustChangePassword,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email' },
  );

  if (upsertProfileError) {
    return jsonResponse(500, { error: upsertProfileError.message || 'Không thể cập nhật user_profiles.' });
  }

  return jsonResponse(200, {
    success: true,
    email,
    authUserId,
    createdAuthUser,
    mustChangePassword,
    defaultPassword: createdAuthUser ? DEFAULT_PASSWORD : null,
  });
});

