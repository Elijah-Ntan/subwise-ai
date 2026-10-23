export async function GET() {
  return Response.json({
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    cloudConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    publicDemoAi: process.env.ALLOW_DEMO_AI === "true",
  });
}
