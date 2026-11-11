import { drawCreditBackground, drawLeader, makeArcs } from './exitCanvas';
import { fakeContext } from '../SkyBackground/testUtils';

const view = { W: 1440, H: 900, dpr: 2, font: 'Oswald, sans-serif' };
const steady = () => 0.5;

describe('countdown leader', () => {
  it('draws the right number and only finite values', () => {
    const calls = [];
    const ctx = fakeContext(calls);
    expect(drawLeader(ctx, view, 0, steady)).toBe(3);
    expect(drawLeader(ctx, view, 1500, steady)).toBe(2);
    expect(drawLeader(ctx, view, 2999, steady)).toBe(1);
    const numbers = calls.filter(([fn]) => fn === 'fillText').map(([, args]) => args[0]);
    expect(numbers).toEqual(['3', '2', '1']);
  });

  it('survives a tiny viewport and a backwards clock', () => {
    const ctx = fakeContext([]);
    expect(() => drawLeader(ctx, { ...view, W: 1, H: 1 }, 100, steady)).not.toThrow();
    expect(() => drawLeader(ctx, view, -400, steady)).not.toThrow();
  });
});

describe('credits backdrop', () => {
  it('draws every arc with its travelling body', () => {
    const calls = [];
    const arcs = makeArcs();
    drawCreditBackground(fakeContext(calls), view, 123456, arcs, steady);
    expect(arcs).toHaveLength(9);
    expect(calls.filter(([fn]) => fn === 'stroke')).toHaveLength(9);
    expect(calls.filter(([fn]) => fn === 'arc')).toHaveLength(18);
  });
});
