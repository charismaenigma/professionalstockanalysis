import OpportunityRadar from '@/components/OpportunityRadar';
import { requireMemberPage } from '@/lib/membership';
export const dynamic='force-dynamic';
export const metadata={
  title:'Daily Opportunity Radar | MarketClarity',
  description:'Evidence-based daily watchlist from completed market sessions. Preliminary screening leads, not live trade recommendations.'
};
export default async function RadarPage(){await requireMemberPage('/radar');return <OpportunityRadar/>}
