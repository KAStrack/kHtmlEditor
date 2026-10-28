import type { Editor } from '../../core/Editor';
import type { ChoiceMenuItemSpec } from '../../core/UiTypes';
import { PluginManager } from '../../core/AddOnManager';
import { getClosestList } from '../lists/Entries';

/** advlist: bullet/number style dropdowns on the list buttons. */
const register = (editor: Editor): void => {
  editor.options.register('advlist_bullet_styles', { processor: 'string', default: 'default,circle,square' });
  editor.options.register('advlist_number_styles', { processor: 'string', default: 'default,lower-alpha,lower-greek,lower-roman,upper-alpha,upper-roman' });

  const styleNames: Record<string, string> = {
    default: 'Default',
    circle: 'Circle',
    disc: 'Disc',
    square: 'Square',
    'lower-alpha': 'Lower Alpha',
    'lower-greek': 'Lower Greek',
    'lower-roman': 'Lower Roman',
    'upper-alpha': 'Upper Alpha',
    'upper-roman': 'Upper Roman',
    decimal: 'Decimal',
  };

  const currentStyle = (listType: 'ul' | 'ol'): string => {
    const list = getClosestList(editor, editor.selection.getStart());
    if (!list || list.nodeName.toLowerCase() !== listType) {
      return '';
    }
    return editor.dom.getStyle(list, 'list-style-type') || 'default';
  };

  const applyStyle = (listType: 'ul' | 'ol', style: string) => {
    const cmd = listType === 'ul' ? 'InsertUnorderedList' : 'InsertOrderedList';
    const list = getClosestList(editor, editor.selection.getStart());
    if (list && list.nodeName.toLowerCase() === listType) {
      editor.execCommand('mceListUpdate', false, { 'list-style-type': style === 'default' ? '' : style });
    } else {
      editor.execCommand(cmd, false, style === 'default' ? undefined : { style: 'list-style-type: ' + style + ';' });
    }
  };

  const items = (listType: 'ul' | 'ol'): ChoiceMenuItemSpec[] => {
    const styles = (editor.options.get(listType === 'ul' ? 'advlist_bullet_styles' : 'advlist_number_styles') as string).split(',').map((s) => s.trim()).filter((s) => s.length);
    return styles.map((style) => ({ type: 'choiceitem', value: style, text: styleNames[style] || style, icon: 'list-' + (listType === 'ul' ? 'bull' : 'num') + '-' + style }));
  };

  const register2 = (name: string, listType: 'ul' | 'ol', icon: string, tooltip: string) => {
    const styles = (editor.options.get(listType === 'ul' ? 'advlist_bullet_styles' : 'advlist_number_styles') as string).split(',').map((s) => s.trim());
    if (styles.length <= 1) {
      return;
    }
    editor.ui.registry.addSplitButton(name, {
      icon,
      tooltip,
      presets: 'listpreview',
      columns: 3,
      select: (value) => currentStyle(listType) === value || (value === 'default' && (currentStyle(listType) === 'disc' || currentStyle(listType) === 'decimal')),
      fetch: (callback) => callback(items(listType)),
      onAction: () => editor.execCommand(listType === 'ul' ? 'InsertUnorderedList' : 'InsertOrderedList'),
      onItemAction: (_api, value) => applyStyle(listType, value),
      onSetup: (api) => {
        const update = () => {
          const list = getClosestList(editor, editor.selection.getStart());
          api.setActive(!!list && list.nodeName.toLowerCase() === listType);
          api.setEnabled(!editor.readonly);
        };
        editor.on('NodeChange SwitchMode', update);
        update();
        return () => editor.off('NodeChange SwitchMode', update);
      },
    });
  };
  // Register after lists so the split buttons replace the plain toggle buttons.
  editor.on('PreInit', () => {
    register2('bullist', 'ul', 'unordered-list', 'Bullet list');
    register2('numlist', 'ol', 'ordered-list', 'Numbered list');
  });
  register2('bullist', 'ul', 'unordered-list', 'Bullet list');
  register2('numlist', 'ol', 'ordered-list', 'Numbered list');
};

PluginManager.add('advlist', register);
export default register;
