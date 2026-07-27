import { memo, useCallback } from 'react';
import { ActionIcon, Indicator } from '@mantine/core';
import { IconShoppingCart } from '@tabler/icons-react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useCartStore } from 'entities/Commerce';

/**
 * CartControl — cart icon button in the left strip.
 *
 * Navigates to /cart to open the route-driven cart drawer.
 * Navigates to / to close it if already on /cart.
 */
export const CartControl = memo(function CartControl() {
  const navigate = useNavigate();
  const { isCartRoute, currentSpotId } = useRouterState({
    select: (s) => ({
      isCartRoute: s.location.pathname === '/cart',
      currentSpotId: s.matches
        .flatMap((m) => {
          const id = (m.params as { spotId?: string }).spotId;
          return id ? [id] : [];
        })
        .at(0),
    }),
  });
  const count = useCartStore((s) => s.items.length);

  const handleClick = useCallback(() => {
    void navigate({
      to: isCartRoute ? '/' : '/cart',
      search: !isCartRoute && currentSpotId ? { from: currentSpotId } : undefined,
    });
  }, [navigate, isCartRoute, currentSpotId]);

  if (count === 0) return null;

  return (
    <Indicator
      label={count}
      size={16}
      color="pink"
    >
      <ActionIcon
        variant="transparent"
        size="lg"
        aria-label={`Cart, ${count} item${count !== 1 ? 's' : ''}`}
        onClick={handleClick}
        style={{ color: 'var(--wa-status-success)', border: '1px solid rgba(74, 222, 128, 0.5)', borderRadius: 10 }}
      >
        <IconShoppingCart size={18} />
      </ActionIcon>
    </Indicator>
  );
});
