import Link from 'next/link';
import PremarketDesk from '@/components/PremarketDesk';
export const metadata={title:'Premarket Research Desk — MarketClarity',description:'Read-only 6 AM, 7:30 AM and 8:15 AM premarket analysis.'};
export default function Page(){return <main className="shell">
 <header className="top"><div><div className="brand">MarketClarity</div><div className="tag">Premarket discovery · IEX single exchange</div></div>
 <div className="mainTopActions"><Link className="radarHome" href="/opportunity-lab">Opportunity Lab</Link><Link className="radarHome" href="/paper">Paper Trading Lab</Link><Link className="radarHome" href="/">Home</Link></div></header>
 <PremarketDesk/>
 <footer>Read-only market-data study. No trading orders are submitted by this page. Premarket liquidity, spreads and fills can differ sharply from regular-session conditions.</footer>
 </main>}