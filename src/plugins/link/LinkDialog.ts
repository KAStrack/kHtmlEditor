import type { Editor } from '../../core/Editor';
import * as Utils from './Utils';
import { isFunction } from '../../util/Type';

interface DialogData {
  url: { value: string; meta?: Record<string, any> };
  text?: string;
  title?: string;
  anchor?: string;
  link?: string;
  target?: string;
  rel?: string;
  linkClass?: string;
}

const prefixUrl = (editor: Editor, url: string): Promise<string> => {
  const trimmed = url.trim();
  if (!trimmed || Utils.isAbsoluteLike(trimmed)) {
    return Promise.resolve(trimmed);
  }
  const assume = editor.options.get('link_assume_external_targets');
  const protocol = (editor.options.get('link_default_protocol') as string) || 'https';
  if (Utils.looksLikeEmail(trimmed)) {
    return new Promise((resolve) => {
      editor.windowManager.confirm(editor.translate('The URL you entered seems to be an email address. Do you want to add the required mailto: prefix?'), (ok) => resolve(ok ? 'mailto:' + trimmed : trimmed));
    });
  }
  if (Utils.looksLikeExternal(trimmed)) {
    if (assume === true || assume === 'http' || assume === 'https') {
      const scheme = assume === true ? protocol : assume;
      return Promise.resolve(scheme + '://' + trimmed);
    }
    return new Promise((resolve) => {
      editor.windowManager.confirm(editor.translate('The URL you entered seems to be an external link. Do you want to add the required {0}:// prefix?').replace('{0}', protocol), (ok) => resolve(ok ? protocol + '://' + trimmed : trimmed));
    });
  }
  return Promise.resolve(trimmed);
};

export const insertLink = (editor: Editor, attrs: Utils.LinkAttrs, anchor: HTMLAnchorElement | null, text: string | undefined, initialText: string): void => {
  const dom = editor.dom;
  // Attribute order follows TinyMCE's getLinkAttrs: href, title, rel, class, target.
  const linkAttrs: Record<string, string | null> = {
    href: attrs.href,
    title: attrs.title || null,
    rel: Utils.applyRelTargetRules(editor, attrs.rel, attrs.target) || null,
    class: attrs.class || null,
    target: attrs.target || null,
  };
  const postprocess = editor.options.get('link_attributes_postprocess');
  if (isFunction(postprocess)) {
    postprocess(linkAttrs);
  }
  editor.undoManager.transact(() => {
    if (anchor) {
      Object.keys(linkAttrs).forEach((k) => dom.setAttrib(anchor, k, linkAttrs[k]));
      anchor.setAttribute('data-mce-href', attrs.href);
      if (text !== undefined && text !== initialText && anchor.textContent !== text) {
        anchor.textContent = text;
      }
      editor.selection.select(anchor);
      editor.selection.collapse(false);
      editor.focus();
      return;
    }
    const collapsed = editor.selection.isCollapsed();
    if (collapsed || (text !== undefined && text !== initialText)) {
      const content = text && text.length ? text : attrs.href;
      const a = dom.create('a', Object.fromEntries(Object.entries(linkAttrs).filter(([, v]) => v !== null)) as Record<string, string>, '');
      a.textContent = content;
      a.setAttribute('data-mce-href', attrs.href);
      editor.insertContent(a.outerHTML);
      return;
    }
    const applyAttrs: Record<string, string> = {};
    Object.keys(linkAttrs).forEach((k) => {
      if (linkAttrs[k] !== null) {
        applyAttrs[k] = linkAttrs[k] as string;
      }
    });
    editor.execCommand('mceInsertLink', false, applyAttrs);
  });
  editor.nodeChanged();
};

export const openDialog = (editor: Editor): void => {
  const anchor = Utils.getAnchorElement(editor);
  const onlyText = Utils.isOnlyTextSelected(editor);
  const initialText = onlyText ? Utils.getLinkText(editor, anchor) : '';
  const initialUrl = anchor ? anchor.getAttribute('data-mce-href') || anchor.getAttribute('href') || '' : '';
  const hasTitle = editor.options.get('link_title') !== false;
  const defaultTarget = (editor.options.get('link_default_target') as string) || '';

  Utils.getLinkList(editor).then((linkList) => {
    if (editor.removed) {
      return;
    }
    const anchors = Utils.getAnchors(editor);
    const targets = Utils.getTargetList(editor);
    const rels = Utils.getRelList(editor);
    const classes = Utils.getClassList(editor);

    const items: any[] = [{ type: 'urlinput', name: 'url', label: 'URL', filetype: 'file' }];
    if (onlyText) {
      items.push({ type: 'input', name: 'text', label: 'Text to display' });
    }
    if (hasTitle) {
      items.push({ type: 'input', name: 'title', label: 'Title' });
    }
    if (linkList && linkList.length) {
      items.push({ type: 'listbox', name: 'link', label: 'Link list', items: [{ text: 'None', value: '' }, ...linkList] });
    }
    if (anchors) {
      items.push({ type: 'listbox', name: 'anchor', label: 'Anchors', items: [{ text: 'None', value: '' }, ...anchors] });
    }
    if (targets) {
      items.push({ type: 'listbox', name: 'target', label: 'Open link in...', items: targets });
    }
    if (rels) {
      items.push({ type: 'listbox', name: 'rel', label: 'Rel', items: rels });
    }
    if (classes) {
      items.push({ type: 'listbox', name: 'linkClass', label: 'Class', items: classes });
    }

    let textTracksUrl = !initialText || initialText === initialUrl;
    const initialData: DialogData = {
      url: { value: initialUrl },
      text: initialText,
      title: anchor ? anchor.getAttribute('title') || '' : '',
      anchor: '',
      link: '',
      target: anchor ? anchor.getAttribute('target') || '' : defaultTarget,
      rel: anchor ? anchor.getAttribute('rel') || '' : '',
      linkClass: anchor ? anchor.getAttribute('class') || '' : '',
    };

    editor.windowManager.open({
      title: 'Insert/Edit Link',
      size: 'normal',
      body: { type: 'panel', items },
      buttons: [
        { type: 'cancel', name: 'cancel', text: 'Cancel' },
        { type: 'submit', name: 'save', text: 'Save', primary: true },
      ],
      initialData: initialData as any,
      onChange: (api: any, details: { name: string }) => {
        const d = api.getData() as DialogData;
        switch (details.name) {
          case 'url': {
            const meta = d.url.meta || {};
            const patch: Record<string, any> = {};
            if (meta.text !== undefined) {
              patch.text = meta.text;
              textTracksUrl = false;
            } else if (onlyText && textTracksUrl) {
              patch.text = d.url.value;
            }
            if (meta.title !== undefined) {
              patch.title = meta.title;
            }
            if (Object.keys(patch).length) {
              api.setData(patch);
            }
            break;
          }
          case 'text':
            textTracksUrl = !d.text || d.text === d.url.value;
            break;
          case 'link':
            if (d.link) {
              const picked = linkList?.find((l) => l.value === d.link);
              api.setData({ url: { value: d.link, meta: {} }, ...(onlyText && textTracksUrl ? { text: picked ? picked.text : d.link } : {}) });
              textTracksUrl = textTracksUrl && !picked;
            }
            break;
          case 'anchor':
            if (d.anchor) {
              api.setData({ url: { value: d.anchor, meta: {} } });
            }
            break;
          default:
            break;
        }
      },
      onSubmit: (api: any) => {
        const d = api.getData() as DialogData;
        const text = onlyText ? d.text : undefined;
        const rawUrl = d.url.value.trim();
        if (!rawUrl) {
          // Empty URL removes the link.
          if (anchor) {
            Utils.unlink(editor);
          }
          api.close();
          return;
        }
        api.close();
        prefixUrl(editor, rawUrl).then((href) => {
          insertLink(editor, { href, title: d.title, target: d.target, rel: d.rel, class: d.linkClass }, anchor, text, initialText);
        });
      },
    } as any);
  });
};
