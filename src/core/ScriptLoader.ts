/** Loads external scripts (external_plugins, language packs) once, returning promises. */
export class ScriptLoader {
  private states: Record<string, Promise<void>> = {};

  loadScript(url: string): Promise<void> {
    const existing = this.states[url] as Promise<void> | undefined;
    if (existing) {
      return existing;
    }
    const p = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = false;
      script.onload = () => {
        script.onload = script.onerror = null;
        resolve();
      };
      script.onerror = () => {
        script.onload = script.onerror = null;
        delete this.states[url];
        reject(new Error('Failed to load script: ' + url));
      };
      (document.head || document.documentElement).appendChild(script);
    });
    this.states[url] = p;
    return p;
  }

  loadScripts(urls: string[]): Promise<void> {
    return urls.reduce((acc, url) => acc.then(() => this.loadScript(url)), Promise.resolve());
  }

  isDone(url: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.states, url);
  }

  static ScriptLoader = new ScriptLoader();
}
