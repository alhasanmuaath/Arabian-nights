import type { SupabaseClient } from '@supabase/supabase-js'
import type { Comment, Review, TargetType, TeamMember } from './types'

/** Names + roles of the whole team (works for every role; no emails). */
export async function getTeam(supabase: SupabaseClient): Promise<Map<string, TeamMember>> {
  const { data } = await supabase.rpc('team_directory')
  return new Map(((data ?? []) as TeamMember[]).map((p) => [p.id, p]))
}

export type Feedback = { comments: Map<string, Comment[]>; reviews: Map<string, Review[]> }

/** Comments and "reviewed" ticks for a list of items of one type. */
export async function getFeedback(supabase: SupabaseClient, type: TargetType, ids: string[]): Promise<Feedback> {
  const comments = new Map<string, Comment[]>()
  const reviews = new Map<string, Review[]>()
  if (!ids.length) return { comments, reviews }
  const [c, r] = await Promise.all([
    supabase.from('comments').select('*').eq('target_type', type).in('target_id', ids).order('created_at'),
    supabase.from('reviews').select('*').eq('target_type', type).in('target_id', ids).order('created_at'),
  ])
  for (const row of (c.data ?? []) as Comment[]) comments.set(row.target_id, [...(comments.get(row.target_id) ?? []), row])
  for (const row of (r.data ?? []) as Review[]) reviews.set(row.target_id, [...(reviews.get(row.target_id) ?? []), row])
  return { comments, reviews }
}

/** Short-lived links for private files (place photos, script files). */
export async function signUrls(supabase: SupabaseClient, bucket: string, paths: string[], seconds = 3600) {
  const out = new Map<string, string>()
  if (!paths.length) return out
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, seconds)
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl)
  return out
}
