import { redirect } from 'next/navigation'

export default function LoginPage() {
  const returnTo = encodeURIComponent('https://fleet.bouncebackbrian.com/dashboard')
  redirect(`https://3boost.bouncebackbrian.com/login?returnTo=${returnTo}`)
}
