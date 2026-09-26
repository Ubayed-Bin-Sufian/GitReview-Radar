describe('config', () => {
  const original = process.env.JEV_API_KEY;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.JEV_API_KEY;
    } else {
      process.env.JEV_API_KEY = original;
    }
    jest.resetModules();
  });

  it('boots when JEV_API_KEY is unset', () => {
    delete process.env.JEV_API_KEY;
    jest.resetModules();
    const { getConfig, validateConfig } = require('../../src/config');
    const config = getConfig();
    expect(config.jevApiKey).toBe('');
    expect(validateConfig(config)).toBe(true);
  });
});
