// Pure reference adapter for U02. No DOM, storage, or resource-loading side effects.
export function formatMessage(template, entry, params = {}) {
  const values = {};
  for (const placeholder of entry.placeholders) {
    const { name, type, printf, precision, precisionParam } = placeholder;
    if (!Object.hasOwn(params, name)) throw new Error(`Missing i18n parameter: ${name}`);
    const value = params[name];
    if (type === 'string') {
      if (typeof value !== 'string') throw new TypeError(`Expected string: ${name}`);
      values[name] = value;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Expected finite number: ${name}`);
      if (printf === '%d') values[name] = String(Math.trunc(value));
      else {
        const digits = precisionParam ? params[precisionParam] : precision;
        if (!Number.isInteger(digits) || digits < 0 || digits > 100) {
          throw new RangeError(`Invalid i18n precision: ${precisionParam ?? name}`);
        }
        values[name] = value.toFixed(digits);
      }
    }
  }
  // Function replacement preserves literal '$&', braces, etc. in player names.
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`Undeclared i18n placeholder: ${name}`);
    return values[name];
  });
}

export function createI18n({ en, zh, catalog }, initialLocale = 'zh') {
  let locale = initialLocale === 'en' ? 'en' : 'zh';
  const packs = { en, zh };
  return {
    get locale() { return locale; },
    setLocale(next) { locale = next === 'en' ? 'en' : 'zh'; },
    t(inputKey, params = {}) {
      const key = catalog.aliases[inputKey] ?? catalog.sourceToKey[inputKey] ?? inputKey;
      const template = packs[locale].messages[key] ?? en.messages[key];
      if (template === undefined) return inputKey;
      const entry = catalog.entries[key];
      if (!entry) throw new Error(`Missing i18n metadata: ${key}`);
      return formatMessage(template, entry, params);
    },
  };
}
