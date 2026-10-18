(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EstudiaPomodoro = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DURATIONS = Object.freeze({ study: 1500, shortBreak: 300, longBreak: 900 });

  function createPomodoro({ now, onComplete } = {}) {
    if (typeof now !== 'function') throw new Error('Pomodoro requiere una función now().');
    let phase = 'study';
    let remainingSeconds = DURATIONS.study;
    let running = false;
    let completedStudies = 0;
    let lastTick = null;

    function nextPhase() {
      if (phase === 'study') {
        completedStudies += 1;
        return completedStudies % 4 === 0 ? 'longBreak' : 'shortBreak';
      }
      return 'study';
    }

    function getState() {
      return {
        phase,
        remainingSeconds,
        running,
        completedStudies,
      };
    }

    function start() {
      running = true;
      lastTick = now();
    }

    function pause() {
      if (!running) return;
      const elapsed = Math.floor((now() - lastTick) / 1000);
      remainingSeconds = Math.max(0, remainingSeconds - elapsed);
      running = false;
      lastTick = null;
    }

    function reset() {
      phase = 'study';
      remainingSeconds = DURATIONS.study;
      running = false;
      completedStudies = 0;
      lastTick = null;
    }

    function tick() {
      if (!running || !lastTick) return;
      const current = now();
      const elapsed = Math.floor((current - lastTick) / 1000);
      lastTick = current;
      remainingSeconds = Math.max(0, remainingSeconds - elapsed);

      if (remainingSeconds === 0) {
        running = false;
        const completed = phase;
        const following = nextPhase();
        phase = following;
        remainingSeconds = DURATIONS[following];
        if (typeof onComplete === 'function') onComplete(completed);
      }
    }

    return Object.freeze({ start, pause, reset, tick, getState });
  }

  return Object.freeze({ createPomodoro });
});
