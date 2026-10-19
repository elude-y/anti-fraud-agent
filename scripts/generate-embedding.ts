import { createClient } from "@supabase/supabase-js";
import { createEmbedding } from "../src/lib/rag/embedding";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const { data, error } = await supabase
    .from("cases")
    .select("id,title")
    .is("embedding", null);

  if (error) throw error;
  if (!data?.length) {
    console.log("No cases need embeddings.");
    return;
  }

  for (const row of data) {
    const embedding = await createEmbedding(row.title as string);
    const { error: updateError } = await supabase
      .from("cases")
      .update({ embedding })
      .eq("id", row.id);
    if (updateError) throw updateError;
    console.log(`Embedded ${row.id}: ${row.title}`);
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
