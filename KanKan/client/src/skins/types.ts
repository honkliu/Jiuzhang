import type { ThemeOptions } from '@mui/material/styles';

export type SkinId = 'glass' | 'ink' | 'bamboo' | 'mono' | 'sunset' | 'midnight';

export interface Skin {
  id: SkinId;
  label: string;
  labelZh: string;
  description: string;
  /** Inline background applied to <html> and <body>. Color or gradient. */
  bodyBackground: string;
  /** Color used for hyperlinks on Login/Register/ForgotPassword. */
  linkColor: string;
  /** Logo treatment hint for Login. */
  logoStyle?: 'rounded' | 'square' | 'circle';
  theme: ThemeOptions;
}
