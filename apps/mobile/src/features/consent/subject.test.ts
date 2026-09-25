import { describe, expect, it } from 'vitest';
import { subjectSelection } from './subject';

describe('subjectSelection', () => {
  it('cannot proceed before choosing', () => {
    expect(subjectSelection(null, '홍길동', '자녀')).toEqual({
      isProxy: false, canProceed: false, guardianName: '', guardianRelation: '',
    });
  });

  it('self consent needs no proxy details and passes none on', () => {
    expect(subjectSelection('self', ' 홍길동 ', '자녀')).toEqual({
      isProxy: false, canProceed: true, guardianName: '', guardianRelation: '',
    });
  });

  it.each(['guardian', 'legal_representative'] as const)('%s requires a trimmed name and a relation', (subject) => {
    expect(subjectSelection(subject, '   ', '자녀').canProceed).toBe(false);
    expect(subjectSelection(subject, '홍길동', '').canProceed).toBe(false);
    expect(subjectSelection(subject, ' 홍길동 ', '자녀')).toEqual({
      isProxy: true, canProceed: true, guardianName: '홍길동', guardianRelation: '자녀',
    });
  });
});
