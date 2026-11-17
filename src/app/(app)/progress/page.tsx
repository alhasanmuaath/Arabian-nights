import { redirect } from 'next/navigation'

// Replaced by the shared dashboard.
export default function Legacy() {
  redirect('/dashboard')
}
