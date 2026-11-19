import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatRequestBody {
  document_id: string;
  message: string;
}

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

    // User client: verifies token and loads document/claims scoped by RLS
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

    let body: ChatRequestBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { document_id, message } = body;
    if (!document_id || typeof message !== "string" || message.trim().length === 0) {
      return new Response(JSON.stringify({ error: "A message is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (message.length > 2000) {
      return new Response(JSON.stringify({ error: "Message must be 2,000 characters or fewer." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client: used for rate limiting check and inserting messages
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Rate limit: maximum 30 questions per hour per user
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count: userMessageCount } = await serviceClient
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "user")
      .gte("created_at", oneHourAgo);

    if (userMessageCount !== null && userMessageCount >= 30) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached: maximum 30 questions per hour. Please try again later." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Load document using user client to ensure RLS ownership
    const { data: doc, error: docError } = await userClient
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .maybeSingle();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found or access denied." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load claims for this document
    const { data: claims, error: claimsError } = await userClient
      .from("claims")
      .select("*")
      .eq("document_id", document_id)
      .order("page_number", { ascending: true })
      .order("created_at", { ascending: true });

    if (claimsError) {
      return new Response(JSON.stringify({ error: "Failed to load document claims." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load last 12 chat messages for conversation history
    const { data: recentHistory } = await serviceClient
      .from("chat_messages")
      .select("role, content")
      .eq("document_id", document_id)
      .order("created_at", { ascending: false })
      .limit(12);

    const history = (recentHistory || []).reverse();

    // Build grounded verification context for Gemini
    const verdictCounts: Record<string, number> = {};
    for (const c of claims || []) {
      const v = c.user_override_verdict || c.verdict;
      verdictCounts[v] = (verdictCounts[v] || 0) + 1;
    }

    let claimsSummary = "";
    (claims || []).forEach((c, idx) => {
      const num = idx + 1;
      const v = c.user_override_verdict || c.verdict;
      claimsSummary += `Claim ${num}:
- Verdict: ${v}${c.user_override_verdict ? ` (User override, reason: ${c.user_override_reason || "none"})` : ""}
- Claim text: "${c.claim_text}"
- Citation marker: ${c.citation_id || "N/A"}
- Full reference: ${c.citation_full_reference || "N/A"}
- DOI: ${c.citation_doi || "N/A"}
- Evidence quote: "${c.evidence_quote || "None found"}"
- Explanation: ${c.explanation || "N/A"}
- Uncertainty note: ${c.uncertainty_note || "None"}
- Suggested fix: ${c.suggested_fix || "None"}
- Date conflict: ${c.date_conflict ? JSON.stringify(c.date_conflict) : "None"}
- Outdated: ${c.outdated ? `Yes (Newer paper: ${JSON.stringify(c.newer_paper)})` : "No"}
\n`;
    });

    const extractedExcerpt = (doc.extracted_text || "").slice(0, 15000);
    const sourceChangesText = doc.source_changes ? JSON.stringify(doc.source_changes) : "None";

    const documentContext = `VERIFICATION REPORT CONTEXT:
File Name: ${doc.file_name}
Domain: ${doc.domain || "General research"}
Trust Score: ${doc.trust_score !== null && doc.trust_score !== undefined ? doc.trust_score : "N/A"}/100 (Flag: ${doc.flag || "N/A"})
Total Claims: ${(claims || []).length}
Verdict Counts: ${JSON.stringify(verdictCounts)}
Retraction / Correction Notices: ${sourceChangesText}

DOCUMENT EXTRACTED TEXT (EXCERPT):
${extractedExcerpt}

EVALUATED CLAIMS:
${claimsSummary}`;

    const systemInstruction =
      "You are Truvify's report assistant. Answer ONLY using the verification report provided. " +
      "Explain in simple, plain English why a claim received its verdict and what the preferred correction is " +
      "(use the report's suggested fix when there is one; otherwise propose a careful rewording that matches the evidence quote " +
      "and say it should be checked against the paper). Refer to claims as 'Claim N'. " +
      "If the report doesn't contain the answer, say so — never invent papers, DOIs, numbers or quotes. " +
      "Remind the user that this is a verification aid, not a final academic judgment, when they ask for a final decision. " +
      "Keep answers short (under 200 words) unless asked for more.";

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY secret is not set in Supabase Edge Functions." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

    // Map conversation turns into Gemini contents format
    const contents = [
      {
        role: "user",
        parts: [{ text: `Here is the verification report:\n\n${documentContext}` }],
      },
      {
        role: "model",
        parts: [{ text: "Understood. I am Truvify's report assistant. I will answer your questions strictly using this verification report." }],
      },
      ...history.map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      {
        role: "user",
        parts: [{ text: message }],
      },
    ];

    const geminiRes = await fetch(geminiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 800,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);
      return new Response(
        JSON.stringify({
          error: `AI service error (${geminiRes.status}). Please check your Gemini API key and model quota.`,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiData = await geminiRes.json();
    const reply =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "I was unable to find an answer in the report for your question.";

    // Insert user message and assistant reply into chat_messages with service role
    const now = new Date().toISOString();
    const assistantTimestamp = new Date(Date.now() + 50).toISOString();

    const { error: insertErr } = await serviceClient.from("chat_messages").insert([
      {
        document_id,
        user_id: user.id,
        role: "user",
        content: message,
        created_at: now,
      },
      {
        document_id,
        user_id: user.id,
        role: "assistant",
        content: reply,
        created_at: assistantTimestamp,
      },
    ]);

    if (insertErr) {
      console.warn("Failed to persist chat messages:", insertErr);
    }

    return new Response(
      JSON.stringify({
        reply,
        created_at: assistantTimestamp,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    const error = err as Error;
    console.error("report-chat unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
