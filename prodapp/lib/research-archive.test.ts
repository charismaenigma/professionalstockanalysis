import {describe,it,expect} from 'vitest';
import {ARCHIVE_VERSION,archiveToCsv,createArchiveEntry,importBackup,upsertArchive} from './research-archive';
import type {ArchiveSource} from './research-archive';
const source:ArchiveSource={requestedSession:'2026-10-26',mode:'day',horizon:'1d',modelVersion:'demo',scanUniverse:2500,
 selected:[{ticker:'SOFI',rank:1,score:88}],audit:{missed:[],observedPositiveRate:50,capturedLeaders:1,leaderCount:20},
 benchmarks:{endDate:'2026-10-26',complete:true,benchmarks:[
 {ticker:'VOO',sector:'S&P 500',returnPct:2,vsVooPctPoints:0},
 {ticker:'VTI',sector:'Total US stock market',returnPct:1,vsVooPctPoints:-1}
 ],tracked:[{ticker:'SOFI',returnPct:4,vsVooPctPoints:2}]}};
describe('browser research archive',()=>{
 it('snapshots price observations without credentials and keeps 13 ETF rows possible',()=>{
  const a=createArchiveEntry(source,'2026-10-27T10:00:00Z');
  expect(a.benchmarks).toHaveLength(2);expect(a.selected[0].ticker).toBe('SOFI');
  expect(JSON.stringify(a)).not.toContain('token');
  const csv=archiveToCsv([a]);
  expect(csv).toContain('VTI');expect(csv).toContain('SOFI');expect(csv).toContain('Screener score');
 });
 it('replaces same session/strategy/review and preserves older sessions',()=>{
  const a=createArchiveEntry(source,'2026-10-27T10:00:00Z');
  const b=createArchiveEntry(source,'2026-10-27T12:00:00Z');
  expect(upsertArchive([a],b)).toHaveLength(1);
  expect(upsertArchive([a],b)[0].capturedAt).toBe('2026-10-27T12:00:00Z');
 });
 it('checks backup formats rather than trusting pasted JSON',()=>{
  const a=createArchiveEntry(source,'2026-10-27T10:00:00Z');
  expect(importBackup({version:ARCHIVE_VERSION,entries:[a],shortlist:[],exportedAt:'now'}).entries).toHaveLength(1);
  expect(()=>importBackup({version:8,entries:[],shortlist:[]})).toThrow();
  expect(()=>importBackup({version:1,entries:[{id:'fake'}],shortlist:[]})).toThrow();
 });
});
