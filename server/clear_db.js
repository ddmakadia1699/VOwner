import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function clearDB() {
  console.log('Starting DB cleanup...');
  
  const tables = ['messages', 'disputes', 'parking_logs', 'chats', 'blocks', 'vehicles', 'users'];
  
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(`[X] Error clearing ${table}:`, error.message);
    } else {
      console.log(`[+] Cleared table: ${table}`);
    }
  }

  // Clear Auth Users
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  if (authError) {
    console.error('[X] Error listing auth users:', authError.message);
  } else if (authUsers && authUsers.users) {
    for (const user of authUsers.users) {
      await supabase.auth.admin.deleteUser(user.id);
    }
    console.log(`[+] Cleared ${authUsers.users.length} Auth Users`);
  }

  console.log('DB Cleanup Complete!');
}

clearDB();
