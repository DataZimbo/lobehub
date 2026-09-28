import { describe, expect, it } from 'vitest';

import { deliveryStandardsDomainCopy, refineRejectionFields } from './rejectionObservation';

const fields = (overrides: Partial<Parameters<typeof refineRejectionFields>[0]> = {}) => ({
  limits: '',
  reasoning: '浅色线条与白底亮度差太小，看的人分不清圈的是哪块',
  reviewerWords: '',
  ...overrides,
});

describe('refineRejectionFields', () => {
  it('leads the reason with the reviewer’s own sentence when it is really in what they wrote', () => {
    const refined = refineRejectionFields(fields({ reviewerWords: '这个青色太浅了，我看不见' }), [
      { said: ['这个青色太浅了，我看不见 圈的地方'] },
    ]);

    expect(refined.reasonSource).toBe('reviewer');
    expect(refined.reasoning).toBe(
      '“这个青色太浅了，我看不见”\n\n浅色线条与白底亮度差太小，看的人分不清圈的是哪块',
    );
  });

  it('matches across the whitespace and quote marks a model changes when copying', () => {
    const refined = refineRejectionFields(fields({ reviewerWords: '「按钮 太小了」' }), [
      { said: ['按钮太小了'] },
    ]);

    expect(refined.reasonSource).toBe('reviewer');
  });

  it('treats a quote the reviewer never wrote as an inferred reason, whatever the model claims', () => {
    const refined = refineRejectionFields(fields({ reviewerWords: '颜色对比度不足影响可读性' }), [
      { said: ['这里多了一条线'] },
    ]);

    expect(refined.reasonSource).toBe('inferred');
    expect(refined.reasoning).toBe('浅色线条与白底亮度差太小，看的人分不清圈的是哪块');
  });

  it('only looks in the rejections the observation cites', () => {
    const refined = refineRejectionFields(fields({ reviewerWords: '我看不见' }), []);

    expect(refined.reasonSource).toBe('inferred');
  });

  it('drops the "no boundary given" sentence instead of storing it as a boundary', () => {
    expect(refineRejectionFields(fields({ limits: '边界未由评审者说明' }), []).limits).toBeNull();
    expect(refineRejectionFields(fields({ limits: '边界未由评审者说明。' }), []).limits).toBeNull();
    expect(refineRejectionFields(fields({ limits: '  ' }), []).limits).toBeNull();
    expect(refineRejectionFields(fields({ limits: '图表内部不算' }), []).limits).toBe(
      '图表内部不算',
    );
  });
});

describe('deliveryStandardsDomainCopy', () => {
  it('names the first group in Chinese when the reviewer rejected in Chinese', () => {
    expect(
      deliveryStandardsDomainCopy(null, '[R1] promised: 登录\n  said: 按钮太小了'),
    ).toMatchObject({ title: '我的交付规矩' });
    expect(deliveryStandardsDomainCopy('官网', '  said: 对不齐')).toMatchObject({
      title: '官网 交付规矩',
    });
  });

  it('keeps English for a reviewer who wrote in English', () => {
    expect(deliveryStandardsDomainCopy(null, '  said: the button is too small')).toMatchObject({
      title: 'My delivery standards',
    });
  });
});
