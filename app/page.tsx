import { getPublicCards } from '@/lib/actions'
import AppShell from '@/components/app-shell'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const cards = await getPublicCards()

  return (
    <main className="mx-auto w-full max-w-6xl">
      <AppShell cards={cards} />
    </main>
  )
}
