import type { Metadata } from 'next';
import './globals.css';

export const metadata:Metadata={title:'MarketClarity — Professional Stock Analysis',description:'Beginner-friendly professional stock analysis with deterministic scoring, VTI/VOO benchmarks, catalysts, filings and options.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
