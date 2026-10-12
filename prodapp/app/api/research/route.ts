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
      instructions:'Explain stock research evidence in clear plain English. Separate facts from interpretation. Do not change the deterministic model scores, promise returns, or present the output as personalized financial advice. Highlight both supportive and contradictory evidence and say when information is missing.',
      input:`Ticker: ${symbol}\n\nDeterministic app context:\n${context}\n\nReturn a concise simple summary, key positives, key risks, catalyst context, and questions that still need verification.`
    });
    return NextResponse.json({text:response.output_text});
  }catch(e:any){
    return NextResponse.json({error:e?.message||'Research failed'},{status:400});
  }
}
