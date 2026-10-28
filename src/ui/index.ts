import { ThemeManager } from '../core/AddOnManager';
import { createTheme } from './Theme';

/** Registers the default UI theme under TinyMCE's default theme name. */
ThemeManager.add('silver', (editor) => createTheme(editor));
ThemeManager.add('default', (editor) => createTheme(editor));

export { createTheme };
