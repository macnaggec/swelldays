

import React, { FC, memo } from 'react';
import { Box } from '@mantine/core';
import styles from './SelectionCheckbox.module.css';

export interface SelectionCheckboxProps {
  checked: boolean;
}

const SelectionCheckbox: FC<SelectionCheckboxProps> = memo(({ checked }) => {
  return (
    <Box className={styles.checkbox} data-checked={checked}>
      {checked ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="var(--wa-control-fill-active)" stroke="var(--wa-text-primary)" strokeWidth="1.5" />
          <path d="M9 12l2 2 4-4" stroke="var(--wa-text-strong)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="var(--wa-control-fill-muted)" stroke="var(--wa-text-placeholder)" strokeWidth="1.5" />
        </svg>
      )}
    </Box>
  );
});

SelectionCheckbox.displayName = 'SelectionCheckbox';
export default SelectionCheckbox;
