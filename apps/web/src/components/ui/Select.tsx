import { Children, isValidElement, useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { DROPDOWN_OPTION, DROPDOWN_PANEL } from './dropdownStyles';

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'multiple' | 'size'> & { trigger?: ReactNode };
type Option = { value: string; label: ReactNode; disabled: boolean };
function optionText(label: ReactNode): string {
  return Children.toArray(label).map(part => isValidElement<{ children?: ReactNode }>(part) ? optionText(part.props.children) : String(part)).join('');
}
function optionsFrom(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child): Option[] => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return [];
    if (child.type === 'option') return [{ value: String(child.props.value ?? child.props.children ?? ''), label: child.props.children, disabled: !!child.props.disabled }];
    return optionsFrom(child.props.children).map((option) => ({ ...option, disabled: option.disabled || !!child.props.disabled }));
  });
}

/** One styled listbox for all select fields. The native field retains form validation and submission. */
export function Select({ children, trigger, className = '', style, id, value, defaultValue, onChange, disabled, required, name, form, onInvalid, ...rest }: Props) {
  const generatedId = useId();
  const listId = `${generatedId}-options`;
  const field = useRef<HTMLSelectElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [errorPosition, setErrorPosition] = useState({ left: 0, top: 0 });
  const dataAttributes = Object.fromEntries(Object.entries(rest).filter(([key]) => key.startsWith('data-')));
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ''));
  const options = optionsFrom(children);
  const selectedValue = String(value ?? uncontrolled);
  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 160, maxHeight: 288 });
  const transparent = className.includes('opacity-0');

  const show = (last = false) => {
    if (disabled) return;
    setActive(selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : options.findIndex((option) => !option.disabled));
    if (last) setActive(options.findLastIndex((option) => !option.disabled));
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled || !field.current) return;
    field.current.value = option.value;
    field.current.dispatchEvent(new Event('change', { bubbles: true }));
    setOpen(false);
    button.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = button.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(Math.max(box.width, 160), window.innerWidth - 16);
      const below = window.innerHeight - box.bottom - 12;
      const above = box.top - 12;
      const height = Math.min(options.length * 48 + 8, 296, Math.max(below, above));
      setPosition({ left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)), top: below >= height ? box.bottom + 4 : Math.max(8, box.top - height - 4), width, maxHeight: height });
    };
    const outside = (event: PointerEvent) => {
      if (!button.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false);
    };
    place();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, options.length]);
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, listId]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (key === 'Tab') { setOpen(false); return; }
    if (key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (open) choose(active); else show();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      if (!open) { show(key === 'End'); return; }
      const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
      const index = enabled.indexOf(active);
      setActive(key === 'Home' ? enabled[0] : key === 'End' ? enabled[enabled.length - 1] : enabled[Math.max(0, Math.min(enabled.length - 1, index + (key === 'ArrowDown' ? 1 : -1)))]);
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current = { text: (now - search.current.at < 700 ? search.current.text : '') + key.toLocaleLowerCase(), at: now };
      const match = options.findIndex(option => !option.disabled && optionText(option.label).toLocaleLowerCase().startsWith(search.current.text));
      if (!open) show();
      if (match >= 0) setActive(match);
    }
  };
  return <>
    <select ref={field} value={value} defaultValue={defaultValue} name={name} form={form} disabled={disabled} required={required}
      aria-hidden="true" tabIndex={-1} hidden
      onInvalid={(event) => { event.preventDefault(); setValidationMessage(event.currentTarget.validationMessage); const box = button.current?.getBoundingClientRect(); if (box) setErrorPosition({ left: box.left, top: box.bottom + 4 }); button.current?.focus(); onInvalid?.(event); }}
      onChange={(event) => { setUncontrolled(event.target.value); setValidationMessage(''); onChange?.(event); }}>
      {children}
    </select>
    <button {...dataAttributes} ref={button} id={id ?? generatedId} type="button" role="combobox" disabled={disabled}
      aria-label={rest['aria-label']} aria-labelledby={rest['aria-labelledby']} aria-describedby={[rest['aria-describedby'], validationMessage ? `${generatedId}-error` : null].filter(Boolean).join(' ') || undefined}
      aria-required={required || rest['aria-required']} aria-invalid={validationMessage ? true : rest['aria-invalid']}
      aria-expanded={open} aria-controls={open ? listId : undefined} aria-haspopup="listbox" aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      className={`${className.replace(/\bopacity-0\b/g, 'text-transparent')} text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
      style={style} onClick={() => open ? setOpen(false) : show()} onKeyDown={onKeyDown}
      onBlur={() => setOpen(false)}>
      {trigger ?? <span className={transparent ? 'opacity-0' : undefined}>{options[selectedIndex]?.label ?? options[0]?.label}</span>}
    </button>
    {validationMessage && !open && createPortal(<span id={`${generatedId}-error`} role="alert" className={`${DROPDOWN_PANEL} fixed z-[1000] max-w-[300px] px-3 py-2 text-[16px] text-ink-900`} style={errorPosition}>{validationMessage}</span>, document.body)}
    {open && !disabled && createPortal(<div ref={popup} id={listId} role="listbox" aria-label={rest['aria-label']} aria-labelledby={rest['aria-label'] ? undefined : id ?? generatedId}
      className={`${DROPDOWN_PANEL} fixed z-[1000] overflow-y-auto py-[4px]`} style={position}>
      {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option" aria-selected={option.value === selectedValue} aria-disabled={option.disabled || undefined}
        className={`${DROPDOWN_OPTION} shrink-0 cursor-pointer ${option.value === selectedValue ? 'font-semibold text-accent' : 'text-ink-900'} ${active === index ? 'bg-accent-soft' : ''} ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        onPointerDown={(event) => event.preventDefault()} onPointerMove={() => !option.disabled && setActive(index)} onClick={() => choose(index)}><span className="min-w-0 truncate" title={optionText(option.label)}>{option.label}</span></div>)}
    </div>, document.body)}
  </>;
}
