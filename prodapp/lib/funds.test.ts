import {describe,it,expect} from 'vitest';
import {knownFund,notApplicableScore,scoreFundCore,fundTimingSummary} from './funds';
import type {TechnicalSnapshot} from './types';

describe('ETF-specific analysis policy',()=>{
  it('provides a high structural fund-quality score without borrowing company EPS or debt metrics',()=>{
    expect(scoreFundCore('VOO').score).toBe(95.5);
    expect(scoreFundCore('VTI').score).toBe(96);
    expect(scoreFundCore('VOO').components.some(c=>/company profit|P\/E|debt.*equity/i.test(c.name))).toBe(false);
    expect(knownFund('VOO')?.expenseRatioPct).toBe(0.03);
  });
  it('does not rate an arbitrary ETF using VOO or VTI score assumptions',()=>{
    expect(scoreFundCore('UNKNOWN').score).toBeNull();
    expect(notApplicableScore('Not a single company').band).toBe('Not Rated');
  });
  it('keeps fund market timing separate from investment quality',()=>{
    const t:TechnicalSnapshot={trend:'down',rsi14:35,sma50:100,sma200:105};
    expect(fundTimingSummary(t,49)).toContain('not the probability of future gains');
    expect(scoreFundCore('VOO').score).toBe(95.5);
  });
});
