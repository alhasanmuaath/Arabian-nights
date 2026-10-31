export type Role = 'manager' | 'model' | 'member'
export type Access = 'view' | 'edit'
export type ShootStatus = 'free' | 'offered' | 'confirmed' | 'completed'
export type PayStatus = 'paid' | 'not_paid'

export type Person = {
  id: string
  user_id: string | null
  name: string
  email: string
  role: Role
  access: Access
  created_at: string
}

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

export type Availability = {
  id: string
  person_id: string
  date: string
  start_time: string
  end_time: string
  hours: number
}

export type ShootDay = {
  id: string
  date: string
  start_time: string | null
  hours: number
  person_id: string | null
  videos_planned: number
  status: ShootStatus
  notes: string | null
}

export type Pay = {
  id: string
  shoot_day_id: string
  person_id: string
  amount: number
  status: PayStatus
  paid_at: string | null
}

export type ActionState = { error?: string; ok?: string } | null
