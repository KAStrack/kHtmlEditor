import { ScriptLoader } from './ScriptLoader';
import { I18n } from '../i18n/I18n';

/**
 * Registry for plugins and themes (`kHtmlEditor.PluginManager`, `ThemeManager`), compatible with
 * `tinymce.PluginManager.add(name, (editor, url) => api)`.
 */
export type AddOnConstructor<T> = (editor: any, url: string) => T | void;

export interface AddOnManager<T> {
  items: Array<AddOnConstructor<T>>;
  urls: Record<string, string>;
  lookup: Record<string, { instance: AddOnConstructor<T> }>;
  get: (name: string) => AddOnConstructor<T> | undefined;
  requireLangPack: (name: string, languages?: string) => void;
  add: (id: string, addOn: AddOnConstructor<T>) => AddOnConstructor<T>;
  remove: (name: string) => void;
  createUrl: (baseUrl: string | { prefix: string; resource: string; suffix: string }, dep: string | { prefix: string; resource: string; suffix: string }) => { prefix: string; resource: string; suffix: string };
  load: (name: string, addOnUrl: string | { prefix: string; resource: string; suffix: string }) => Promise<void>;
  waitFor: (name: string, state?: 'added' | 'loaded') => Promise<void>;
}

export const createAddOnManager = <T>(): AddOnManager<T> => {
  const items: Array<AddOnConstructor<T>> = [];
  const urls: Record<string, string> = {};
  const lookup: Record<string, { instance: AddOnConstructor<T> }> = {};
  const waiters: Record<string, Array<() => void>> = {};
  let languageLoad = true;
  let baseUrl = '';

  const notify = (name: string) => {
    (waiters[name] || []).forEach((cb) => cb());
    delete waiters[name];
  };

  const get = (name: string) => (lookup[name] ? lookup[name].instance : undefined);

  const requireLangPack = (name: string, languages?: string) => {
    if (languageLoad === false) {
      return;
    }
    const language = I18n.getCode();
    if (language && urls[name]) {
      if (languages && languages.split(',').indexOf(language) === -1) {
        return;
      }
      const url = urls[name] + '/langs/' + language + '.js';
      ScriptLoader.ScriptLoader.loadScript(url).catch(() => undefined);
    }
  };

  const add = (id: string, addOn: AddOnConstructor<T>) => {
    items.push(addOn);
    lookup[id] = { instance: addOn };
    notify(id);
    return addOn;
  };

  const remove = (name: string) => {
    delete urls[name];
    delete lookup[name];
  };

  const createUrl: AddOnManager<T>['createUrl'] = (base, dep) => {
    if (typeof dep === 'object') {
      return dep;
    }
    return typeof base === 'string' ? { prefix: '', resource: dep, suffix: '' } : { prefix: base.prefix, resource: dep, suffix: base.suffix };
  };

  const load = (name: string, addOnUrl: string | { prefix: string; resource: string; suffix: string }): Promise<void> => {
    let url = typeof addOnUrl === 'string' ? addOnUrl : addOnUrl.prefix + addOnUrl.resource + addOnUrl.suffix;
    if (url.indexOf('/') !== 0 && url.indexOf('://') === -1) {
      url = baseUrl + '/' + url;
    }
    urls[name] = url.substring(0, url.lastIndexOf('/'));
    if (lookup[name]) {
      return Promise.resolve();
    }
    return ScriptLoader.ScriptLoader.loadScript(url).then(() => waitFor(name));
  };

  const waitFor = (name: string): Promise<void> => {
    if (lookup[name]) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      (waiters[name] = waiters[name] || []).push(resolve);
    });
  };

  const manager = { items, urls, lookup, get, requireLangPack, add, remove, createUrl, load, waitFor } as AddOnManager<T> & { setBaseUrl: (url: string) => void; setLanguageLoad: (state: boolean) => void };
  manager.setBaseUrl = (url: string) => {
    baseUrl = url;
  };
  manager.setLanguageLoad = (state: boolean) => {
    languageLoad = state;
  };
  return manager;
};

export const PluginManager = createAddOnManager<any>();
export const ThemeManager = createAddOnManager<any>();
