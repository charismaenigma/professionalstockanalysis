import StockApp from '@/components/StockApp';
import { redirect } from 'next/navigation';
import { paywallEnabled } from '@/lib/membership-config';
export default async function Page({searchParams}:{searchParams:Promise<{ticker?:string}>}){
  const {ticker}=await searchParams;
  if(ticker&&/^[A-Za-z0-9.^-]{1,12}$/.test(ticker))redirect(`/research?ticker=${encodeURIComponent(ticker)}`);
  return <StockApp publicLanding membershipRequired={paywallEnabled()}/>;
}
