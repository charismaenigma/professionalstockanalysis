import { NextResponse } from 'next/server';
export async function GET(){
  const market=Boolean(process.env.MASSIVE_API_KEY);
  return NextResponse.json({
    ok:true,
    mode:market?'market-eod':'demo',
    features:{
      marketData:market,
      secFundamentals:market,
      options:Boolean(process.env.MASSIVE_API_KEY),
      aiResearch:Boolean(process.env.OPENAI_API_KEY),
      fmpCatalysts:Boolean(process.env.FMP_API_KEY)
    }
  });
}
