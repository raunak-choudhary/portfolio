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
});
