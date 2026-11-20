import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import { Icon } from '@astryxdesign/core/Icon';
import { Languages } from 'lucide-react';
import { useI18n, type Locale } from '../lib/i18n';

export function LanguageSwitcher() {
  const { locale, isZh, setLocale } = useI18n();

  const handleChange = (value: string) => {
    if (value === 'en' || value === 'zh-CN') {
      setLocale(value as Locale);
    }
  };

  return (
    <DropdownMenu
      alignment="end"
      menuWidth={140}
      onOpenChange={(open) => {
        if (!open) {
          window.requestAnimationFrame(() => {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          });
        }
      }}
      button={{
        label: isZh ? '简体中文' : 'English',
        variant: 'ghost',
        size: 'sm',
        icon: <Icon icon={Languages} />,
      }}
    >
      <DropdownMenuRadioGroup
        value={locale}
        onChange={handleChange}
        label={isZh ? '选择语言' : 'Select language'}
      >
        <DropdownMenuRadioItem value="zh-CN" label="简体中文" />
        <DropdownMenuRadioItem value="en" label="English" />
      </DropdownMenuRadioGroup>
    </DropdownMenu>
  );
}
