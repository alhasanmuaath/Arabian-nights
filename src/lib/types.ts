export type Role = 'manager' | 'model' | 'member' | 'photographer' | 'organizer'
export type Access = 'view' | 'edit'
export type ShootStatus = 'planned' | 'completed' | 'cancelled'
export type CrewResponse = 'pending' | 'accepted' | 'declined'
export type PayStatus = 'paid' | 'not_paid'
export type TargetType = 'announcement' | 'file' | 'asset'

export type Person = {
  id: string
  user_id: string | null
  name: string
  email: string
  role: Role
  access: Access
  created_at: string
}

/** What everyone on the team may know about a teammate (no email). */
export type TeamMember = { id: string; name: string; role: Role }

export type Targets = {
  id: number
  season_start: string
  season_end: string
  target_hours: number
  target_videos: number
  target_days_min: number
  target_days_max: number
  day_rate: number
  currency: string
}

export type ShootDay = {
  id: string
  date: string
  start_time: string | null
  hours: number
  videos_planned: number
  status: ShootStatus
  notes: string | null
  title: string | null
  location_name: string | null
  location_address: string | null
  location_url: string | null
  meeting_point: string | null
  meeting_time: string | null
}

export type Attendee = {
  id: string
  shoot_day_id: string
  person_id: string
  response: CrewResponse
  responded_at: string | null
}

export type Asset = {
  id: string
  shoot_day_id: string
  kind: 'photo' | 'script'
  title: string
  body: string | null
  storage_path: string | null
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string
  created_at: string
}

export type Comment = {
  id: string
  target_type: TargetType
  target_id: string
  person_id: string
  body: string
  created_at: string
}

export type Review = { target_type: TargetType; target_id: string; person_id: string; created_at: string }

export type Pay = {
  id: string
  shoot_day_id: string
  person_id: string
  amount: number
  status: PayStatus
  paid_at: string | null
}

export type ActionState = { error?: string; ok?: string } | null
