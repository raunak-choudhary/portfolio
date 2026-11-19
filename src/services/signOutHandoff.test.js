// The hand-off flag between "Sign out everywhere" and the sign-out film.

import { beginFilmHandoff, cancelFilmHandoff, isFilmHandoff } from './signOutHandoff';

describe('signOutHandoff', () => {
  afterEach(() => cancelFilmHandoff());

  it('is closed until opened, and closes again on cancel', () => {
    expect(isFilmHandoff()).toBe(false);
    beginFilmHandoff();
    expect(isFilmHandoff()).toBe(true);
    cancelFilmHandoff();
    expect(isFilmHandoff()).toBe(false);
  });
});
