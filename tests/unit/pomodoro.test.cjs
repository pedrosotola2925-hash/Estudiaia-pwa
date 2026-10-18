'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPomodoro } = require('../../src/shared/pomodoro.js');

test('Pomodoro starts in study phase with 25 minutes', () => {
  let now = Date.now();
  let completions = 0;
  const clock = createPomodoro({
    now: () => now,
    onComplete: () => { completions += 1; },
  });

  const state = clock.getState();
  assert.equal(state.phase, 'study');
  assert.equal(state.remainingSeconds, 1500);
  assert.equal(state.running, false);
  assert.equal(state.completedStudies, 0);
  assert.equal(completions, 0);
});

test('Pomodoro advances study→short break→study, and long break after four studies', () => {
  let now = Date.now();
  let completions = 0;
  const clock = createPomodoro({
    now: () => now,
    onComplete: () => { completions += 1; },
  });

  // Study 1 → Short break
  clock.start();
  now += 1500 * 1000;
  clock.tick();
  assert.equal(completions, 1);
  assert.equal(clock.getState().phase, 'shortBreak');
  assert.equal(clock.getState().remainingSeconds, 300);
  assert.equal(clock.getState().running, false);
  assert.equal(clock.getState().completedStudies, 1);

  // Short break → Study 2
  clock.start();
  now += 300 * 1000;
  clock.tick();
  assert.equal(completions, 2);
  assert.equal(clock.getState().phase, 'study');
  assert.equal(clock.getState().remainingSeconds, 1500);
  assert.equal(clock.getState().running, false);

  // Study 2 → Short break
  clock.start();
  now += 1500 * 1000;
  clock.tick();
  assert.equal(completions, 3);
  assert.equal(clock.getState().phase, 'shortBreak');

  // Short break → Study 3
  clock.start();
  now += 300 * 1000;
  clock.tick();
  assert.equal(completions, 4);
  assert.equal(clock.getState().phase, 'study');

  // Study 3 → Short break
  clock.start();
  now += 1500 * 1000;
  clock.tick();
  assert.equal(completions, 5);
  assert.equal(clock.getState().phase, 'shortBreak');
  assert.equal(clock.getState().completedStudies, 3);

  // Short break → Study 4
  clock.start();
  now += 300 * 1000;
  clock.tick();
  assert.equal(completions, 6);
  assert.equal(clock.getState().phase, 'study');
  assert.equal(clock.getState().completedStudies, 3);

  // Study 4 → Long break (per spec: long break after four study blocks)
  clock.start();
  now += 1500 * 1000;
  clock.tick();
  assert.equal(completions, 7);
  assert.equal(clock.getState().phase, 'longBreak');
  assert.equal(clock.getState().remainingSeconds, 900);
  assert.equal(clock.getState().running, false);
  assert.equal(clock.getState().completedStudies, 4);
});

test('Pomodoro pause does not lose time and reset returns to study', () => {
  let now = Date.now();
  const clock = createPomodoro({ now: () => now, onComplete: () => {} });

  clock.start();
  now += 600 * 1000; // 10 min elapse while running
  clock.tick();
  assert.equal(clock.getState().phase, 'study');
  assert.equal(clock.getState().remainingSeconds, 1500 - 600);

  clock.pause();
  assert.equal(clock.getState().running, false);
  const pausedRemaining = clock.getState().remainingSeconds;

  now += 300 * 1000; // 5 more min while paused
  clock.tick();
  assert.equal(clock.getState().remainingSeconds, pausedRemaining);

  clock.reset();
  const reset = clock.getState();
  assert.equal(reset.phase, 'study');
  assert.equal(reset.remainingSeconds, 1500);
  assert.equal(reset.running, false);
  assert.equal(reset.completedStudies, 0);
});
