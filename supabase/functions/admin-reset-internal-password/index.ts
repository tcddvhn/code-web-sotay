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
    return jsonResponse(403, { error: 'Chỉ quản trị hệ thống mới được đặt lại mật khẩu tài khoản nội bộ.' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Body request không hợp lệ.' });
  }

  const email = normalizeEmail(payload.email);
  if (!email) {
    return jsonResponse(400, { error: 'Email tài khoản nội bộ không hợp lệ.' });
  }

  const { data: profile, error: profileError } = await adminClient
    .from('user_profiles')
    .select('email, auth_user_id, is_active')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle();

  if (profileError) {
    return jsonResponse(500, { error: profileError.message || 'Không thể đọc hồ sơ tài khoản nội bộ.' });
  }

  if (!profile || !profile.auth_user_id) {
    return jsonResponse(404, {
      error: 'Tài khoản này chưa có đăng nhập Supabase Auth. Hãy dùng chức năng "Cấp đăng nhập" trước.',
    });
  }

  const { error: resetError } = await adminClient.auth.admin.updateUserById(profile.auth_user_id, {
    password: DEFAULT_PASSWORD,
    email_confirm: true,
  });

  if (resetError) {
    return jsonResponse(400, { error: resetError.message || 'Không thể đặt lại mật khẩu tài khoản Supabase Auth.' });
  }

  const { error: updateProfileError } = await adminClient
    .from('user_profiles')
    .update({
      must_change_password: true,
      updated_at: new Date().toISOString(),
    })
    .eq('email', email);

  if (updateProfileError) {
    return jsonResponse(500, {
      error: updateProfileError.message || 'Đã đổi mật khẩu nhưng không thể cập nhật cờ bắt buộc đổi mật khẩu.',
    });
  }

  return jsonResponse(200, {
    success: true,
    email,
    authUserId: profile.auth_user_id,
    mustChangePassword: true,
    defaultPassword: DEFAULT_PASSWORD,
  });
});
