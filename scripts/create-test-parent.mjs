import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  // Read from .env.local
  const fs = await import('fs');
  const path = await import('path');
  const envPath = path.join(import.meta.dirname, '..', '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key === 'NEXT_PUBLIC_SUPABASE_URL' && !supabaseUrl) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = valueParts.join('=');
    }
    if (key === 'SUPABASE_SERVICE_ROLE_KEY' && !serviceRoleKey) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = valueParts.join('=');
    }
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Use admin API to create user so we control the UUID
const testId = crypto.randomUUID();
const passcode = '0000';

console.log(`Creating parent with id: ${testId}`);

const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  id: testId,
  email: `${testId}@test.local`,
  password: passcode,
  email_confirm: true,
  user_metadata: {},
});

if (authError && !authError.message?.includes('already been registered')) {
  console.error('Auth error:', authError);
  process.exit(1);
}

// Now insert parent
const { data: parent, error: parentError } = await supabase
  .from('parents')
  .insert({
    id: testId,
    passcode: passcode,
  })
  .select()
  .single();

if (parentError) {
  // If it's a duplicate key error, parent already exists
  if (parentError.code === '23505') {
    console.log('Parent already exists!');
    const { data: existing } = await supabase
      .from('parents')
      .select('*')
      .eq('passcode', passcode)
      .single();
    console.log('Existing parent:', existing);
  } else {
    console.error('Parent insert error:', parentError);
    process.exit(1);
  }
} else {
  console.log('✅ Test parent created successfully:', parent);
}
