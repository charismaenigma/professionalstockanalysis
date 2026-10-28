import {describe,it,expect} from 'vitest';
import {summarizeReadiness,type ReadinessCheck} from './paper/preflight';
const c=(id:string,status:ReadinessCheck['status']):ReadinessCheck=>({id,status,detail:'test'});
describe('paper preflight pass/warn/block safeguards',()=>{
 it('requires a clean open-market account and an explicitly enabled manual switch for submission readiness',()=>{
  const good=[c('broker','pass'),c('sleeve','pass'),c('iex-feed','pass'),c('market','pass'),c('watchlist','pass')];
  expect(summarizeReadiness(good,true,true).readyForManualPaperOrder).toBe(true);
  expect(summarizeReadiness(good,true,false).readyForManualPaperOrder).toBe(false);
  expect(summarizeReadiness(good,false,true).readyForManualPaperOrder).toBe(false);
 });
 it('blocks unknown exposure and stale quote states',()=>{
  expect(summarizeReadiness([c('sleeve','block')],true,true).readyForPreview).toBe(false);
  expect(summarizeReadiness([c('iex-feed','warning')],true,true).readyForManualPaperOrder).toBe(false);
 });
});
