import { Box, Group, NumberInput, Stack, Text } from '@mantine/core';
import { IconPhoto, IconVideo } from '@tabler/icons-react';
import { MIN_MEDIA_PRICE_CENTS } from 'entities/Media';
import styles from './PriceStep.module.css';

interface PriceStepProps {
  hasTriedPublish: boolean;
  photoPrice: number;
  videoPrice: number;
  onPhotoPriceChange: (price: number) => void;
  onVideoPriceChange: (price: number) => void;
  onPhotoPriceCommit: (price: number) => void;
  onVideoPriceCommit: (price: number) => void;
  /** Hide a price control when its content type isn't in the session (both default true). */
  showPhotoPrice?: boolean;
  showVideoPrice?: boolean;
  isFlashing?: boolean;
}

export function PriceStep({
  hasTriedPublish,
  photoPrice,
  videoPrice,
  onPhotoPriceChange,
  onVideoPriceChange,
  onPhotoPriceCommit,
  onVideoPriceCommit,
  showPhotoPrice = true,
  showVideoPrice = true,
  isFlashing = false,
}: PriceStepProps) {
  const minDollars = MIN_MEDIA_PRICE_CENTS / 100;
  const photoError = hasTriedPublish && photoPrice < MIN_MEDIA_PRICE_CENTS;
  const videoError = hasTriedPublish && videoPrice < MIN_MEDIA_PRICE_CENTS;

  const getInputStyles = (price: number, hasError: boolean) => ({
    input: {
      background: 'var(--wa-control-fill-muted)',
      border: '1px solid var(--wa-control-border)',
      borderRadius: 'var(--wa-radius-chrome)',
      boxShadow: hasError
        ? 'inset 3px 0 0 var(--wa-status-danger)'
        : price >= MIN_MEDIA_PRICE_CENTS
          ? 'inset 3px 0 0 var(--wa-accent-spot)'
          : 'none',
      color: 'var(--wa-text-inverse)',
      transition: 'border-color 120ms ease, box-shadow 120ms ease',
    },
    controls: { borderLeft: '1px solid var(--wa-control-fill)' },
    control: { borderColor: 'var(--wa-control-menu-hover)', color: 'rgba(255,255,255,0.35)' },
  });

  return (
    <Stack gap={0} data-upload-block>
      <Text data-upload-block-title size="sm" fw={500} ta="center" style={{ letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
        Set your price
      </Text>

      <Group gap="md" justify="center">
        {showPhotoPrice && (
          <Group gap={6} align="center">
            <Box style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.45)' }}>
              <IconPhoto size={20} />
            </Box>
            <NumberInput
              size="sm"
              value={photoPrice / 100}
              onChange={(val) => onPhotoPriceChange(typeof val === 'number' ? Math.round(val * 100) : MIN_MEDIA_PRICE_CENTS)}
              onBlur={() => onPhotoPriceCommit(photoPrice)}
              min={minDollars}
              step={1}
              decimalScale={0}
              prefix="$"
              placeholder={`$${minDollars}`}
              w={80}
              data-ready={photoPrice >= MIN_MEDIA_PRICE_CENTS ? 'true' : 'false'}
              error={photoError ? `Min $${minDollars}` : undefined}
              classNames={{ wrapper: styles.priceInputTouch, input: isFlashing && photoError ? styles.inputPulse : undefined }}
              styles={getInputStyles(photoPrice, photoError)}
            />
          </Group>
        )}
        {showVideoPrice && (
          <Group gap={6} align="center">
            <Box style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.45)' }}>
              <IconVideo size={20} />
            </Box>
            <NumberInput
              size="sm"
              value={videoPrice / 100}
              onChange={(val) => onVideoPriceChange(typeof val === 'number' ? Math.round(val * 100) : MIN_MEDIA_PRICE_CENTS)}
              onBlur={() => onVideoPriceCommit(videoPrice)}
              min={minDollars}
              step={1}
              decimalScale={0}
              prefix="$"
              placeholder={`$${minDollars}`}
              w={80}
              data-ready={videoPrice >= MIN_MEDIA_PRICE_CENTS ? 'true' : 'false'}
              error={videoError ? `Min $${minDollars}` : undefined}
              classNames={{ wrapper: styles.priceInputTouch, input: isFlashing && !photoError && videoError ? styles.inputPulse : undefined }}
              styles={getInputStyles(videoPrice, videoError)}
            />
          </Group>
        )}
      </Group>
    </Stack>
  );
}
