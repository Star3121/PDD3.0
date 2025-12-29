import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const bucketsToCreate = ['templates', 'designs', 'images'];

async function initBuckets() {
  console.log('Initializing Supabase buckets...');

  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }

    const existingBucketNames = buckets.map(b => b.name);
    console.log('Existing buckets:', existingBucketNames);

    for (const bucketName of bucketsToCreate) {
      if (!existingBucketNames.includes(bucketName)) {
        console.log(`Creating bucket: ${bucketName}...`);
        const { data, error } = await supabase.storage.createBucket(bucketName, {
          public: true,
          fileSizeLimit: 10485760, // 10MB
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
        });

        if (error) {
          console.error(`Error creating bucket ${bucketName}:`, error);
        } else {
          console.log(`Bucket ${bucketName} created successfully.`);
        }
      } else {
        console.log(`Bucket ${bucketName} already exists.`);
        
        // Ensure it is public
        const { data, error } = await supabase.storage.updateBucket(bucketName, {
          public: true
        });
        if (error) {
            console.error(`Error updating bucket ${bucketName} to public:`, error);
        } else {
            console.log(`Bucket ${bucketName} updated to public.`);
        }
      }
    }
    
    console.log('Bucket initialization complete.');

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

initBuckets();
