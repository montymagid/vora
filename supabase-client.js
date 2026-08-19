// ============================================================
// VORA — Supabase client
// Uses the public/publishable key only (safe for the browser).
// Never put service_role keys in frontend code.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://moqrwmutnwqlwjsbybqo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cgsirf9wPxMf0f1PGL9F9Q_b_YWka3h';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
