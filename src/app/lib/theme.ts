import type { CSSProperties } from 'react';
import { createTheme, type CSSVariablesResolver } from '@mantine/core';

// CSS variable overrides that cascade into overlay subtrees so child
// Mantine components (inputs, labels, text) render correctly on glass backgrounds.
const overlayTokens = {
  '--mantine-color-text':           'var(--wa-text-primary)',
  '--mantine-color-bright':         'var(--wa-text-strong)',
  '--mantine-color-dimmed':         'var(--wa-text-dimmed)',
  '--mantine-color-placeholder':    'var(--wa-text-placeholder)',
  '--mantine-color-default':        'var(--wa-control-fill)',
  '--mantine-color-default-hover':  'var(--wa-control-fill-hover)',
  '--mantine-color-default-color':  'var(--wa-text-primary)',
  '--mantine-color-default-border': 'var(--wa-control-border)',
} as CSSProperties;

// Shared glass surface shell applied to all overlay-type components
const glassOverlay: CSSProperties = {
  background:           'var(--wa-surface-overlay)',
  backdropFilter:       'var(--wa-glass-blur-md)',
  WebkitBackdropFilter: 'var(--wa-glass-blur-md)',
  border:               '1px solid var(--wa-glass-border)',
  boxShadow:            'var(--wa-glass-shadow-md)',
  borderRadius:         'var(--wa-radius-chrome)',
  ...overlayTokens,
};

export const theme = createTheme({
  fontFamily: '"Geist Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  components: {
    Input: {
      styles: {
        input: {
          background: 'var(--wa-control-fill)',
          border:     '1px solid var(--wa-control-border)',
          color:      'var(--wa-text-primary)',
          caretColor: 'var(--wa-text-primary)',
          // Below 16px, iOS Safari zooms the whole page in on focus.
          fontSize:   'var(--wa-font-size-input)',
          '&::placeholder': {
            color: 'var(--wa-text-placeholder)',
          },
          '&:focus': {
            borderColor: 'var(--wa-glass-border-media-overlay-hover)',
          },
        },
        section: {
          color: 'var(--wa-text-muted)',
        },
      },
    },
    Popover: {
      styles: {
        dropdown: glassOverlay,
        arrow: {
          background:  'var(--wa-surface-overlay)',
          borderColor: 'var(--wa-glass-border)',
        },
      },
    },
    Menu: {
      styles: {
        dropdown: { ...glassOverlay, padding: '4px' },
        item: {
          borderRadius: 'var(--wa-radius-control-sm)',
          color:        'var(--wa-text-primary)',
        },
        divider: {
          borderColor: 'var(--wa-control-fill)',
        },
        label: {
          color: 'var(--wa-text-dimmed)',
        },
      },
    },
    Modal: {
      defaultProps: {
        overlayProps: { backgroundOpacity: 0.5, blur: 4 },
        zIndex: 500,
      },
      styles: {
        content: {
          ...glassOverlay,
          // Opaque surface (no backdrop blur): an animation over a translucent modal (upload
          // spinner, skeleton) forces a full-stack re-blend every frame — audible coil whine.
          // Opaque lets the GPU occlude the background, so the blur is also pointless here.
          background:           'var(--wa-surface-dialog-opaque)',
          backdropFilter:       'none',
          WebkitBackdropFilter: 'none',
          borderRadius:         'var(--wa-radius-dialog)',
        },
        header: {
          background: 'transparent',
        },
        title: {
          color:      'var(--wa-text-primary)',
          fontWeight: 600,
        },
        close: {
          color: 'var(--wa-text-dimmed)',
        },
      },
    },
    Tooltip: {
      defaultProps: {
        withArrow: false,
      },
      styles: {
        tooltip: {
          background:           'var(--wa-surface-overlay)',
          backdropFilter:       'var(--wa-glass-blur-sm)',
          WebkitBackdropFilter: 'var(--wa-glass-blur-sm)',
          border:               '1px solid var(--wa-glass-border)',
          color:                'var(--wa-text-primary)',
          borderRadius:         'var(--wa-radius-control-sm)',
          fontSize:             '12px',
        },
      },
    },
    Notification: {
      styles: {
        root: {
          ...glassOverlay,
        },
        title: {
          color:      'var(--wa-text-primary)',
          fontWeight: 600,
        },
        description: {
          color: 'var(--wa-text-dimmed)',
        },
      },
    },
    Combobox: {
      styles: {
        dropdown: glassOverlay,
        option: {
          color:        'var(--wa-text-primary)',
          borderRadius: 'var(--wa-radius-control-sm)',
        },
      },
    },
  },
});

// Global Mantine CSS variable overrides for the app's dark-only glass design system.
// Mirrors the mappings previously scoped to the ".context" class in materials.module.css,
// applied here for every Mantine component in the app (not just the overlay subtree it was
// manually attached to).
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {},
  dark: {
    '--mantine-color-text':                  'var(--wa-text-primary)',
    '--mantine-color-bright':                'var(--wa-text-strong)',
    '--mantine-color-dimmed':                'var(--wa-text-dimmed)',
    '--mantine-color-placeholder':           'var(--wa-text-placeholder)',
    '--mantine-color-default':               'var(--wa-control-fill)',
    '--mantine-color-default-hover':         'var(--wa-control-fill-hover)',
    '--mantine-color-default-color':         'var(--wa-text-primary)',
    '--mantine-color-default-border':        'var(--wa-control-border)',
    '--mantine-color-gray-0':                'var(--wa-control-fill-muted)',
    '--mantine-color-gray-1':                'var(--wa-control-fill-muted)',
    '--mantine-primary-color-filled':        'var(--wa-control-fill-active)',
    '--mantine-primary-color-filled-hover':  'var(--wa-control-fill-active-hover)',
    '--mantine-primary-color-contrast':      'var(--wa-text-inverse)',
    '--mantine-primary-color-light':         'var(--wa-control-fill)',
    '--mantine-primary-color-light-hover':   'var(--wa-control-fill-hover)',
  },
});
