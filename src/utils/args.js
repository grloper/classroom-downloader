function npmConfigKey(flagName) {
  return `npm_config_${flagName.replace(/^--/, '').replaceAll('-', '_')}`;
}

export function hasFlag(flagName, argv = process.argv, env = process.env) {
  if (argv.includes(flagName)) return true;

  const key = npmConfigKey(flagName);
  if (env[key] === 'true') return true;

  if (flagName.startsWith('--no-')) {
    const invertedKey = npmConfigKey(`--${flagName.slice(5)}`);
    return Object.hasOwn(env, invertedKey) && env[invertedKey] === '';
  }

  return false;
}
