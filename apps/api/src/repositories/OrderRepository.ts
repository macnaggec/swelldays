import { OrderStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import type { OrderLineSnapshot, PersistedOrderLine } from 'server/domain/OrderEconomics';

/** The narrow slice of a Prisma client this repository writes orders through. */
export type OrderWriteClient = {
  order: Pick<Prisma.TransactionClient['order'], 'create'>;
};

export type OrderWithItems = {
  id: string;
  buyerId: string | null;
  guestEmail: string | null;
  externalOrderId: string | null;
  totalAmount: number;
  status: OrderStatus;
  checkoutSessionUrl: string | null;
  items: PersistedOrderLine[];
};

export type CreateOrderData = {
  buyerId: string | null;
  guestEmail?: string;
  clientRequestId: string;
  items: OrderLineSnapshot[];
};

export interface IOrderRepository {
  createOrder(
    data: CreateOrderData,
    db?: OrderWriteClient,
  ): Promise<OrderWithItems>;
  findOrderById(id: string): Promise<OrderWithItems | null>;
  findOrderByExternalId(externalOrderId: string): Promise<{ id: string } | null>;
  findOrderByBuyerAndClientRequestId(
    buyerId: string | null,
    clientRequestId: string,
  ): Promise<OrderWithItems | null>;
  findPendingMediaItemIds(
    buyerId: string,
    mediaItemIds: string[],
    sinceCreatedAt: Date,
  ): Promise<string[]>;
  markOrderFailed(orderId: string): Promise<void>;
  saveGuestEmail(orderId: string, email: string): Promise<void>;
  saveCheckoutSessionUrl(orderId: string, checkoutUrl: string): Promise<void>;
}

const ORDER_ITEMS_INCLUDE = {
  items: {
    select: {
      id: true,
      mediaItemId: true,
      unitAmountCents: true,
      currency: true,
      sellerId: true,
      feePolicyVersion: true,
      platformFeeAmount: true,
      sellerEarningsAmount: true,
      deliverablePublicId: true,
      deliverableType: true,
    },
  },
} as const;

export class OrderRepository implements IOrderRepository {
  // Passing a transaction client here is what lets the caller create the
  // order inside the same transaction that holds the buyer lock.
  createOrder(
    data: CreateOrderData,
    db: OrderWriteClient = prisma,
  ): Promise<OrderWithItems> {
    return runQuery(async () => {
      return db.order.create({
        data: {
          buyerId: data.buyerId,
          guestEmail: data.guestEmail,
          totalAmount: data.items.reduce((sum, item) => sum + item.unitAmountCents, 0),
          clientRequestId: data.clientRequestId,
          items: {
            createMany: {
              data: data.items,
            },
          },
        },
        include: ORDER_ITEMS_INCLUDE,
      });
    });
  }

  findOrderById(id: string): Promise<OrderWithItems | null> {
    return runQuery(() =>
      prisma.order.findUnique({
        where: { id },
        include: ORDER_ITEMS_INCLUDE,
      })
    );
  }

  findOrderByExternalId(externalOrderId: string): Promise<{ id: string } | null> {
    return runQuery(() =>
      prisma.order.findUnique({ where: { externalOrderId }, select: { id: true } })
    );
  }

  findOrderByBuyerAndClientRequestId(
    buyerId: string | null,
    clientRequestId: string,
  ): Promise<OrderWithItems | null> {
    return runQuery(() =>
      prisma.order.findFirst({
        where: { buyerId, clientRequestId },
        include: ORDER_ITEMS_INCLUDE,
      })
    );
  }

  findPendingMediaItemIds(
    buyerId: string,
    mediaItemIds: string[],
    sinceCreatedAt: Date,
  ): Promise<string[]> {
    return runQuery(async () => {
      const rows = await prisma.orderItem.findMany({
        where: {
          mediaItemId: { in: mediaItemIds },
          order: {
            buyerId,
            status: OrderStatus.PENDING,
            createdAt: { gte: sinceCreatedAt },
          },
        },
        select: { mediaItemId: true },
      });
      return rows.map((r) => r.mediaItemId);
    });
  }

  markOrderFailed(orderId: string): Promise<void> {
    return runQuery(async () => {
      // updateMany with status: PENDING guard — a terminal order (COMPLETED/FAILED) is never overwritten
      await prisma.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.FAILED },
      });
    });
  }

  saveGuestEmail(orderId: string, email: string): Promise<void> {
    return runQuery(async () => {
      // updateMany with guestEmail: null guard — idempotent, single round-trip
      await prisma.order.updateMany({
        where: { id: orderId, guestEmail: null },
        data: { guestEmail: email },
      });
    });
  }

  saveCheckoutSessionUrl(orderId: string, checkoutUrl: string): Promise<void> {
    return runQuery(async () => {
      await prisma.order.update({
        where: { id: orderId },
        data: { checkoutSessionUrl: checkoutUrl },
      });
    });
  }
}

export const orderRepository = new OrderRepository();
