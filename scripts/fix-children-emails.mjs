import { createClient } from '@supabase/supabase-js';

const fs = await import('fs');
const path = await import('path');
const envPath = path.join(import.meta.dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');

let supabaseUrl = null;
let serviceRoleKey = null;
let anonKey = null;
for (const line of envContent.split('\n')) {
  const [key, ...valueParts] = line.split('=');
  if (key === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = valueParts.join('=');
  if (key === 'SUPABASE_SERVICE_ROLE_KEY') serviceRoleKey = valueParts.join('=');
  if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') anonKey = valueParts.join('=');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const anonClient = createClient(supabaseUrl, anonKey);

// List all children to fix auth
const { data: children } = await supabase.from('children').select('*');
if (!children || children.length === 0) {
  console.log('No children found');
  process.exit(0);
}

for (const child of children) {
  const validEmail = `${child.id}@child.local`;
  const { error } = await supabase.auth.admin.updateUserById(child.id, { email: validEmail });
  if (error) {
    console.log(`Child ${child.name} (${child.id}): email update error: ${error.message}`);
  } else {
    console.log(`Child ${child.name} (${child.id}): email set to ${validEmail}`);
  }
}

console.log('\nDone! All children auth fixed.');
