import type { Metadata } from 'next';
import './globals.css';
import './paper.css';
import { ClerkProvider } from '@clerk/nextjs';
import MemberNav from '@/components/MemberNav';
import { authConfigured, paywallEnabled } from '@/lib/membership-config';

export const metadata:Metadata={title:'MarketClarity — Professional Stock Analysis',description:'Beginner-friendly professional stock analysis with deterministic scoring, VTI/VOO benchmarks, catalysts, filings and options.'};
export default function RootLayout({children}:{children:React.ReactNode}){
  const configured=authConfigured();
  const content=<>{paywallEnabled()&&<div className="shell accountBar"><MemberNav configured={configured}/></div>}{children}</>;
  return <html lang="en"><body>{configured?<ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">{content}</ClerkProvider>:content}</body></html>;
}
