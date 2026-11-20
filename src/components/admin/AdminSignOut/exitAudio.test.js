import { createExitAudio } from './exitAudio';

/** A recording stand-in for AudioContext with just the nodes the sequence uses. */
function fakeAudioContext(log) {
  const node = (name) => ({ connect(next) { log.push(`${name}->`); return next; }, start() { log.push(`${name}.start`); }, stop() { log.push(`${name}.stop`); }, buffer: null, loop: false, type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }, Q: { value: 0 } });
  return {
    state: 'running', currentTime: 0, sampleRate: 8000, destination: { name: 'out' },
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => node('noise'), createBiquadFilter: () => node('filter'), createGain: () => node('gain'), createOscillator: () => node('osc'),
    close() { log.push('close'); },
  };
}

describe('exit audio', () => {
  it('plays the clap, the beeps and the whir through the context when enabled', () => {
    const log = [];
    const audio = createExitAudio({ enabled: true, createContext: () => fakeAudioContext(log) });
    audio.clap(); audio.beep(); audio.beep(true); audio.whirOn(); audio.whirOn();
    expect(log.filter((l) => l === 'noise.start')).toHaveLength(2);   // clap burst and the whir loop, not a second whir
    expect(log.filter((l) => l === 'osc.start')).toHaveLength(4);     // clap thud, two beeps, the whir flutter
    audio.dispose();
    expect(log).toContain('close');
  });

  it('is silent when disabled and never creates a context', () => {
    let created = 0;
    const audio = createExitAudio({ enabled: false, createContext: () => { created++; return fakeAudioContext([]); } });
    audio.clap(); audio.beep(); audio.whirOn(); audio.whirOff();
    expect(created).toBe(0);
    audio.setEnabled(true); audio.beep();
    expect(created).toBe(1);
  });

  it('stays quiet when the browser refuses an audio context', () => {
    const audio = createExitAudio({ enabled: true, createContext: () => { throw new Error('no audio'); } });
    expect(() => { audio.clap(); audio.beep(); audio.whirOn(); audio.whirOff(); audio.dispose(); }).not.toThrow();
  });

  it('creates no context until a gesture when the page was not reached by a click', () => {
    let created = 0;
    const audio = createExitAudio({ enabled: true, eager: false, createContext: () => { created++; return fakeAudioContext([]); } });
    audio.clap(); audio.beep(); audio.whirOn();
    expect(created).toBe(0);            // nothing for the browser to refuse, so nothing for it to warn about
    audio.unlock();                     // the first click or key on the page
    expect(created).toBe(1);
    audio.beep();
    expect(created).toBe(1);
  });

  describe('a suspended context (every new one for a moment; Safari until a gesture)', () => {
    /** A context that starts suspended and runs once `resume()` is settled by the test. */
    const suspended = (log) => {
      const ac = fakeAudioContext(log); ac.state = 'suspended';
      let settle; const resumed = new Promise((resolve) => { settle = resolve; });
      ac.resume = () => resumed;
      return { ac, run: async () => { ac.state = 'running'; settle(); await resumed; await Promise.resolve(); } };
    };

    it('plays a sound whose context resumes at once', async () => {
      const log = [], { ac, run } = suspended(log);
      let clock = 0;
      const audio = createExitAudio({ createContext: () => ac, now: () => clock });
      audio.clap();
      expect(log).not.toContain('noise.start');   // nothing is scheduled on a frozen clock
      clock = 40; await run();
      expect(log.filter((l) => l === 'noise.start')).toHaveLength(1);
    });

    it('drops the clap and the beeps asked for long before the context could run, and starts the whir if it is still wanted', async () => {
      const log = [], { ac, run } = suspended(log);
      let clock = 0;
      const audio = createExitAudio({ createContext: () => ac, now: () => clock });
      audio.clap(); audio.beep(); audio.beep(true); audio.whirOn();
      clock = 4000;                                // the first click comes four seconds into the film
      audio.unlock(); await run();
      expect(log.filter((l) => l === 'osc.start')).toHaveLength(1);    // the whir's flutter only: no burst of stale beeps
      expect(log.filter((l) => l === 'noise.start')).toHaveLength(1);  // the whir loop, not the clap
    });

    it('does not start a whir that was switched off while the context was suspended', async () => {
      const log = [], { ac, run } = suspended(log);
      const audio = createExitAudio({ createContext: () => ac });
      audio.whirOn(); audio.whirOff();
      audio.unlock(); await run();
      expect(log).not.toContain('noise.start');
    });
  });
});
