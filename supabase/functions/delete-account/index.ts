import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
      "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Supabase environment variables not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify requesting user
    const userClient = createClient(supabaseUrl, supabaseAnonKey || serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session. Please log in again." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin / service-role client for account deletion
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Delete all storage files in documents/{user.id}/
    try {
      const folder = `${user.id}`;
      const { data: topLevelItems } = await serviceClient.storage
        .from("documents")
        .list(folder);

      if (topLevelItems && topLevelItems.length > 0) {
        const filesToDelete: string[] = [];
        for (const item of topLevelItems) {
          if (!item.id) {
            // Subfolder (e.g. document_id folder)
            const { data: subItems } = await serviceClient.storage
              .from("documents")
              .list(`${folder}/${item.name}`);
            if (subItems && subItems.length > 0) {
              for (const sub of subItems) {
                filesToDelete.push(`${folder}/${item.name}/${sub.name}`);
              }
            }
          } else {
            filesToDelete.push(`${folder}/${item.name}`);
          }
        }
        if (filesToDelete.length > 0) {
          await serviceClient.storage.from("documents").remove(filesToDelete);
        }
      }
    } catch (storageErr) {
      console.warn("Storage deletion error (non-fatal):", storageErr);
    }

    // 2. Delete user's documents (claims and chat messages cascade on delete)
    const { error: docDeleteErr } = await serviceClient
      .from("documents")
      .delete()
      .eq("user_id", user.id);

    if (docDeleteErr) {
      console.error("Failed to delete user documents:", docDeleteErr);
    }

    // 3. Delete auth user
    const { error: authDeleteErr } = await serviceClient.auth.admin.deleteUser(user.id);
    if (authDeleteErr) {
      console.error("Failed to delete auth user:", authDeleteErr);
      return new Response(JSON.stringify({ error: authDeleteErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("delete-account unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
