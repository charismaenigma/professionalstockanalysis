import { NextResponse } from 'next/server';
export async function GET(){return NextResponse.json({ok:true,mode:process.env.FMP_API_KEY?'live':'demo',features:{marketData:Boolean(process.env.FMP_API_KEY),options:Boolean(process.env.MASSIVE_API_KEY),aiResearch:Boolean(process.env.OPENAI_API_KEY),sec:true}})}
