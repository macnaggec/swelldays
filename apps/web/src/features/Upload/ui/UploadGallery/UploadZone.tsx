import { useRef } from 'react';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconBrandGoogleDrive, IconFolderOpen, IconUpload } from '@tabler/icons-react';
import { handleFileSelection } from '../../lib/fileSelection';
import { materialClasses } from 'shared/ui/design-system';
import { AppButton } from 'shared/ui/AppButton';

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  onDriveImport?: () => void;
  driveLoading?: boolean;
  disabled?: boolean;
}

export function UploadZone({ onFilesSelected, onDriveImport, driveLoading, disabled }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelection(Array.from(e.target.files ?? []), onFilesSelected);
    e.target.value = '';
  };

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleChange}
        hidden
        aria-label="File upload input"
      />
      <Stack
        data-upload-module
        data-upload-zone
        gap="var(--upload-section-gap)"
        align="center"
        className={`${materialClasses.uploadZone} ${disabled ? materialClasses.uploadZoneDisabled : ''}`}
      >
        <IconUpload size={28} stroke={1.5} className={materialClasses.uploadZoneIcon} />
        <Text size="xs" className={materialClasses.uploadZoneText}>Images & videos · max 50MB per file</Text>
        <Group gap="xs">
          <AppButton
            tone="highlight"
            leftSection={<IconBrandGoogleDrive size={14} />}
            onClick={() => !disabled && onDriveImport?.()}
            loading={driveLoading}
            disabled={disabled}
          >
            Google Drive
          </AppButton>
          <AppButton
            leftSection={<IconFolderOpen size={14} />}
            onClick={() => !disabled && inputRef.current?.click()}
            disabled={disabled}
          >
            Local files
          </AppButton>
        </Group>
      </Stack>
    </Box>
  );
}
