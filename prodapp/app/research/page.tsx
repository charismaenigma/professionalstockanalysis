import StockApp from '@/components/StockApp';
import { requireMemberPage } from '@/lib/membership';

export const dynamic = 'force-dynamic';
export default async function ResearchPage({ searchParams }: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { ticker } = await searchParams;
  await requireMemberPage(`/research${ticker ? `?ticker=${encodeURIComponent(ticker)}` : ''}`);
  return <StockApp />;
}

