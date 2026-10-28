import { isString, isNumber, isBoolean, isArray, isFunction, isObject, isRegExp, isArrayOf } from '../util/Type';

/**
 * Editor options registry (`editor.options`), compatible with TinyMCE 6+:
 * `register`, `isRegistered`, `get`, `set`, `unset`, `isSet`, `debug`.
 */

export type BuiltInOptionType = 'string' | 'number' | 'boolean' | 'array' | 'function' | 'object' | 'string[]' | 'object[]' | 'regexp';
export type ProcessorResult<T> = { valid: true; value: T } | { valid: false; message: string } | boolean;
export type Processor<T> = (value: unknown) => ProcessorResult<T>;

export interface OptionSpec<T> {
  processor: BuiltInOptionType | Processor<T>;
  default?: T;
  deprecated?: boolean;
  docsUrl?: string;
}

export interface Options {
  /** Registers an option. Re-registering an existing option re-processes the initial value. */
  register: <T>(name: string, spec: OptionSpec<T>) => void;
  isRegistered: (name: string) => boolean;
  get: <T = any>(name: string) => T;
  set: <T>(name: string, value: T) => boolean;
  unset: (name: string) => boolean;
  isSet: (name: string) => boolean;
  debug: () => void;
  /** The raw, unprocessed init configuration (TinyMCE 5 `editor.settings`). */
  getInitial: () => Record<string, any>;
  /** Names of all registered options. */
  names: () => string[];
}

const builtInProcessors: Record<BuiltInOptionType, (v: unknown) => boolean> = {
  string: isString,
  number: isNumber,
  boolean: isBoolean,
  array: isArray,
  function: isFunction,
  object: isObject,
  regexp: isRegExp,
  'string[]': (v) => isArrayOf(v, isString),
  'object[]': (v) => isArrayOf(v, isObject),
};

const getBuiltInProcessor = <T>(type: BuiltInOptionType): Processor<T> => {
  const pred = builtInProcessors[type];
  return (value) => (pred(value) ? { valid: true, value: value as T } : { valid: false, message: `The value must be a ${type}.` });
};

const normalizeProcessor = <T>(processor: BuiltInOptionType | Processor<T>): Processor<T> => (isString(processor) ? getBuiltInProcessor<T>(processor) : processor);

export const createOptions = (initialOptions: Record<string, any>, warn: (msg: string) => void = (m) => console.warn(m)): Options => {
  const registry: Record<string, OptionSpec<any> & { processor: Processor<any> }> = {};
  const values: Record<string, any> = {};

  const processValue = <T>(name: string, processor: Processor<T>, value: unknown): { valid: boolean; value?: T } => {
    const result = processor(value);
    if (isBoolean(result)) {
      return result ? { valid: true, value: value as T } : { valid: false };
    }
    if (result.valid) {
      return { valid: true, value: result.value };
    }
    warn(`The "${name}" option is invalid: ${result.message}`);
    return { valid: false };
  };

  const register = <T>(name: string, spec: OptionSpec<T>) => {
    const processor = normalizeProcessor(spec.processor);
    registry[name] = { ...spec, processor };
    if (Object.prototype.hasOwnProperty.call(initialOptions, name)) {
      const result = processValue(name, processor, initialOptions[name]);
      if (result.valid) {
        values[name] = result.value;
      } else {
        delete values[name];
        if (!isBoolean(spec.processor) && isString(spec.processor)) {
          warn(`The "${name}" option must be a ${spec.processor}; the default is used instead.`);
        }
      }
    }
  };

  const isRegistered = (name: string) => Object.prototype.hasOwnProperty.call(registry, name);

  const get = <T = any>(name: string): T => {
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      return values[name];
    }
    const spec = registry[name];
    if (spec) {
      return spec.default as T;
    }
    // Unregistered options fall back to the raw init value (lenient for third-party plugins).
    return initialOptions[name] as T;
  };

  const set = <T>(name: string, value: T): boolean => {
    const spec = registry[name];
    if (!spec) {
      values[name] = value;
      return true;
    }
    const result = processValue(name, spec.processor, value);
    if (result.valid) {
      values[name] = result.value;
      return true;
    }
    return false;
  };

  const unset = (name: string): boolean => {
    const had = Object.prototype.hasOwnProperty.call(values, name);
    delete values[name];
    return had;
  };

  const isSet = (name: string): boolean => Object.prototype.hasOwnProperty.call(values, name) || (!isRegistered(name) && initialOptions[name] !== undefined);

  const debug = () => {
    // eslint-disable-next-line no-console
    console.log('kHtmlEditor options', { ...Object.fromEntries(Object.keys(registry).map((k) => [k, get(k)])), ...values });
  };

  return { register, isRegistered, get, set, unset, isSet, debug, getInitial: () => initialOptions, names: () => Object.keys(registry) };
};
