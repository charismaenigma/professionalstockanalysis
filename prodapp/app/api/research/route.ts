import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime='nodejs';

export async function POST(req:NextRequest){
  if(!process.env.OPENAI_API_KEY){
    return NextResponse.json({error:'AI research is optional. Add OPENAI_API_KEY to enable it.'},{status:503});
  }
  try{
    const body=await req.json();
    const symbol=String(body.symbol||'').toUpperCase();
    const context=JSON.stringify(body.context??{}).slice(0,50000);
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await client.responses.create({
      model:process.env.OPENAI_MODEL||'gpt-5.6',
      store:false,
      instructions:'Explain investment research evidence in clear plain English. The context identifies an instrumentType of Stock or ETF. For ETFs, explain diversification, fund costs, index methodology, market timing, fund concentration and ETF-specific risks; DO NOT interpret missing company EPS, debt/equity or SEC corporate filings as ETF weaknesses. Distinguish structural issuer-reported facts (and their as-of dates) from real-time verification. For individual stocks, explain company fundamentals and risks. Separate facts from interpretation. Do not change deterministic scores, promise returns, invent missing facts, or present the output as personalized financial advice. Highlight supportive and contradictory evidence and identify any gaps.',
      input:`Ticker: ${symbol}\n\nDeterministic app context:\n${context}\n\nReturn a concise simple summary, key positives, key risks, relevant events or fund considerations, and information that still needs verification. If analyzing an ETF, do not refer to the ETF as if it were a single operating business.`
    });
    return NextResponse.json({text:response.output_text});
  }catch(e:any){
    return NextResponse.json({error:e?.message||'Research failed'},{status:400});
  }
}
