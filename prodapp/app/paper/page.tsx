import Link from 'next/link';
import PaperDesk from '@/components/PaperDesk';

export const metadata = {
  title: 'Paper Trading Lab — MarketClarity',
  description: 'Live-data-gated simulated swing trades and transparent performance measurement.',
};
export default function PaperTradingPage(){
  return <main className="shell">
    <header className="top">
      <div><div className="brand">MarketClarity</div><div className="tag">Paper Trading Lab · Simulated trades only</div></div>
      <Link className="radarHome" href="/">← Back to Research</Link>
    </header>
    <PaperDesk/>
    <footer>Paper-only research experiment. All entries and P/L are simulated. Past paper performance does not imply future live results.</footer>
  </main>;
}
