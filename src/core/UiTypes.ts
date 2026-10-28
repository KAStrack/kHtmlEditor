/**
 * Public UI specification types – modelled on TinyMCE's `editor.ui.registry` so that custom
 * buttons, menu items, context toolbars and dialogs written for TinyMCE work unchanged.
 */

export interface ButtonApi {
  isEnabled: () => boolean;
  setEnabled: (state: boolean) => void;
  setText: (text: string) => void;
  setIcon: (icon: string) => void;
}
export interface ToggleButtonApi extends ButtonApi {
  isActive: () => boolean;
  setActive: (state: boolean) => void;
}
export interface MenuButtonApi extends ButtonApi {
  isActive: () => boolean;
  setActive: (state: boolean) => void;
  setTooltip?: (tooltip: string) => void;
}
export interface SplitButtonApi extends ToggleButtonApi {
  setIconFill?: (id: string, value: string) => void;
}

export interface BaseButtonSpec<Api> {
  text?: string;
  icon?: string;
  tooltip?: string;
  enabled?: boolean;
  shortcut?: string;
  context?: string;
  onSetup?: (api: Api) => (api: Api) => void;
}
export interface ToolbarButtonSpec extends BaseButtonSpec<ButtonApi> {
  type?: 'button';
  onAction: (api: ButtonApi) => void;
}
export interface ToolbarToggleButtonSpec extends BaseButtonSpec<ToggleButtonApi> {
  type?: 'togglebutton';
  active?: boolean;
  onAction: (api: ToggleButtonApi) => void;
}
export type MenuFetchCallback = (items: string | Array<MenuItemSpec | NestedMenuItemSpec | ToggleMenuItemSpec | ChoiceMenuItemSpec | SeparatorMenuItemSpec | FancyMenuItemSpec>) => void;
export interface ToolbarMenuButtonSpec extends BaseButtonSpec<MenuButtonApi> {
  type?: 'menubutton';
  search?: boolean | { placeholder?: string };
  fetch: (success: MenuFetchCallback, fetchContext: { pattern: string }, api: MenuButtonApi) => void;
}
export interface ToolbarSplitButtonSpec extends BaseButtonSpec<SplitButtonApi> {
  type?: 'splitbutton';
  columns?: number | 'auto';
  presets?: 'normal' | 'color' | 'listpreview';
  select?: (value: string) => boolean;
  fetch: (success: (items: ChoiceMenuItemSpec[]) => void, api?: SplitButtonApi) => void;
  onAction: (api: SplitButtonApi) => void;
  onItemAction: (api: SplitButtonApi, value: string) => void;
}
export interface GroupToolbarButtonSpec extends BaseButtonSpec<ButtonApi> {
  type?: 'grouptoolbarbutton';
  items: string | string[];
}
export type ToolbarButtonAnySpec = ToolbarButtonSpec | ToolbarToggleButtonSpec | ToolbarMenuButtonSpec | ToolbarSplitButtonSpec | GroupToolbarButtonSpec;

export interface MenuItemApi {
  isEnabled: () => boolean;
  setEnabled: (state: boolean) => void;
}
export interface ToggleMenuItemApi extends MenuItemApi {
  isActive: () => boolean;
  setActive: (state: boolean) => void;
}
export interface BaseMenuItemSpec<Api> {
  text?: string;
  icon?: string;
  shortcut?: string;
  enabled?: boolean;
  value?: string;
  meta?: Record<string, any>;
  onSetup?: (api: Api) => (api: Api) => void;
  context?: string;
}
export interface MenuItemSpec extends BaseMenuItemSpec<MenuItemApi> {
  type?: 'menuitem';
  onAction?: (api: MenuItemApi) => void;
}
export interface NestedMenuItemSpec extends BaseMenuItemSpec<MenuItemApi> {
  type?: 'nestedmenuitem';
  getSubmenuItems: () => string | Array<MenuItemSpec | NestedMenuItemSpec | ToggleMenuItemSpec | SeparatorMenuItemSpec | ChoiceMenuItemSpec | FancyMenuItemSpec>;
}
export interface ToggleMenuItemSpec extends BaseMenuItemSpec<ToggleMenuItemApi> {
  type?: 'togglemenuitem';
  active?: boolean;
  onAction: (api: ToggleMenuItemApi) => void;
}
export interface ChoiceMenuItemSpec extends BaseMenuItemSpec<ToggleMenuItemApi> {
  type: 'choiceitem';
  active?: boolean;
  label?: string;
}
export interface SeparatorMenuItemSpec {
  type: 'separator';
  text?: string;
}
export interface FancyMenuItemSpec {
  type: 'fancymenuitem';
  fancytype: 'inserttable' | 'colorswatch';
  initData?: Record<string, any>;
  onAction?: (data: any) => void;
  select?: (value: string) => boolean;
}
export type MenuItemAnySpec = MenuItemSpec | NestedMenuItemSpec | ToggleMenuItemSpec | ChoiceMenuItemSpec | SeparatorMenuItemSpec | FancyMenuItemSpec;

export interface ContextMenuApi {
  isEnabled?: () => boolean;
}
export interface ContextMenuSpec {
  update: (element: Element) => string | Array<string | MenuItemAnySpec>;
}

export interface ContextToolbarSpec {
  type?: 'contexttoolbar';
  predicate: (node: Element) => boolean;
  items: string;
  position?: 'node' | 'selection' | 'line';
  scope?: 'node' | 'editor';
}
export interface ContextFormSpec {
  type: 'contextform';
  predicate: (node: Element) => boolean;
  initValue?: () => string;
  label?: string;
  placeholder?: string;
  launch?: { type?: 'contextformbutton' | 'contextformtogglebutton'; text?: string; icon?: string; tooltip?: string };
  commands: Array<{ type: 'contextformbutton' | 'contextformtogglebutton'; text?: string; icon?: string; tooltip?: string; primary?: boolean; active?: boolean; onAction: (formApi: { getValue: () => string; setValue: (v: string) => void; hide: () => void }, api: any) => void; onSetup?: (api: any) => (api: any) => void }>;
  position?: 'node' | 'selection' | 'line';
  scope?: 'node' | 'editor';
}
export type ContextToolbarAnySpec = ContextToolbarSpec | ContextFormSpec;

export interface SidebarSpec {
  icon?: string;
  tooltip?: string;
  onShow?: (api: { element: () => HTMLElement }) => void;
  onHide?: (api: { element: () => HTMLElement }) => void;
  onSetup?: (api: { element: () => HTMLElement }) => (api: any) => void;
}
export interface ViewSpec {
  buttons?: any[];
  onShow?: (api: { getContainer: () => HTMLElement }) => void;
  onHide?: (api: { getContainer: () => HTMLElement }) => void;
}
export interface AutocompleterSpec {
  trigger?: string;
  ch?: string;
  minChars?: number;
  columns?: number | 'auto';
  matches?: (rng: Range, text: string, pattern: string) => boolean;
  fetch: (pattern: string, maxResults: number, fetchOptions: Record<string, any>) => Promise<Array<{ type?: 'autocompleteitem' | 'cardmenuitem'; value: string; text?: string; icon?: string; meta?: any }>>;
  onAction: (autocompleterApi: { hide: () => void; reload: (fetchOptions: Record<string, any>) => void }, rng: Range, value: string, meta: any) => void;
  maxResults?: number;
  highlightOn?: string[];
}

export interface UiRegistryData {
  buttons: Record<string, ToolbarButtonAnySpec>;
  menuItems: Record<string, MenuItemAnySpec>;
  contextMenus: Record<string, ContextMenuSpec>;
  contextToolbars: Record<string, ContextToolbarAnySpec>;
  icons: Record<string, string>;
  sidebars: Record<string, SidebarSpec>;
  views: Record<string, ViewSpec>;
  autocompleters: Record<string, AutocompleterSpec>;
}

export interface UiRegistry {
  addButton: (name: string, spec: ToolbarButtonSpec) => void;
  addToggleButton: (name: string, spec: ToolbarToggleButtonSpec) => void;
  addMenuButton: (name: string, spec: ToolbarMenuButtonSpec) => void;
  addSplitButton: (name: string, spec: ToolbarSplitButtonSpec) => void;
  addGroupToolbarButton: (name: string, spec: GroupToolbarButtonSpec) => void;
  addMenuItem: (name: string, spec: MenuItemSpec) => void;
  addNestedMenuItem: (name: string, spec: NestedMenuItemSpec) => void;
  addToggleMenuItem: (name: string, spec: ToggleMenuItemSpec) => void;
  addContextMenu: (name: string, spec: ContextMenuSpec) => void;
  addContextToolbar: (name: string, spec: ContextToolbarSpec) => void;
  addContextForm: (name: string, spec: ContextFormSpec) => void;
  addIcon: (name: string, svgData: string) => void;
  addSidebar: (name: string, spec: SidebarSpec) => void;
  addView: (name: string, spec: ViewSpec) => void;
  addAutocompleter: (name: string, spec: AutocompleterSpec) => void;
  getAll: () => UiRegistryData;
}

export const createUiRegistry = (): UiRegistry => {
  const data: UiRegistryData = { buttons: {}, menuItems: {}, contextMenus: {}, contextToolbars: {}, icons: {}, sidebars: {}, views: {}, autocompleters: {} };
  const key = (name: string) => name.toLowerCase();
  return {
    addButton: (name, spec) => {
      data.buttons[key(name)] = { ...spec, type: 'button' };
    },
    addToggleButton: (name, spec) => {
      data.buttons[key(name)] = { ...spec, type: 'togglebutton' };
    },
    addMenuButton: (name, spec) => {
      data.buttons[key(name)] = { ...spec, type: 'menubutton' };
    },
    addSplitButton: (name, spec) => {
      data.buttons[key(name)] = { ...spec, type: 'splitbutton' };
    },
    addGroupToolbarButton: (name, spec) => {
      data.buttons[key(name)] = { ...spec, type: 'grouptoolbarbutton' };
    },
    addMenuItem: (name, spec) => {
      data.menuItems[key(name)] = { ...spec, type: 'menuitem' };
    },
    addNestedMenuItem: (name, spec) => {
      data.menuItems[key(name)] = { ...spec, type: 'nestedmenuitem' };
    },
    addToggleMenuItem: (name, spec) => {
      data.menuItems[key(name)] = { ...spec, type: 'togglemenuitem' };
    },
    addContextMenu: (name, spec) => {
      data.contextMenus[key(name)] = spec;
    },
    addContextToolbar: (name, spec) => {
      data.contextToolbars[key(name)] = { ...spec, type: 'contexttoolbar' };
    },
    addContextForm: (name, spec) => {
      data.contextToolbars[key(name)] = { ...spec, type: 'contextform' };
    },
    addIcon: (name, svgData) => {
      data.icons[key(name)] = svgData;
    },
    addSidebar: (name, spec) => {
      data.sidebars[key(name)] = spec;
    },
    addView: (name, spec) => {
      data.views[key(name)] = spec;
    },
    addAutocompleter: (name, spec) => {
      data.autocompleters[key(name)] = spec;
    },
    getAll: () => data,
  };
};
