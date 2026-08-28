import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';

export type OrderWithItems = {
  id: string;
  buyerId: string | null;
  guestEmail: string | null;
  externalOrderId: string | null;
  totalAmount: number;
  status: OrderStatus;
  checkoutSessionUrl: string | null;
  items: { id: string; mediaItemId: string }[];
};

export type CreateOrderData = {
  buyerId: string | null;
  guestEmail?: string;
  totalAmount: number;
  itemIds: string[];
  clientRequestId: string;
};

export interface IOrderRepository {
  createOrder(data: CreateOrderData): Promise<OrderWithItems>;
  findOrderById(id: string): Promise<OrderWithItems | null>;
  findOrderByExternalId(externalOrderId: string): Promise<{ id: string } | null>;
  findOrderByBuyerAndClientRequestId(
    buyerId: string | null,
    clientRequestId: string,
  ): Promise<OrderWithItems | null>;
  markOrderFailed(orderId: string): Promise<void>;
  saveGuestEmail(orderId: string, email: string): Promise<void>;
  saveCheckoutSessionUrl(orderId: string, checkoutUrl: string): Promise<void>;
}

const ORDER_ITEMS_INCLUDE = {
  items: { select: { id: true, mediaItemId: true } },
} as const;

export class OrderRepository implements IOrderRepository {
  createOrder(data: CreateOrderData): Promise<OrderWithItems> {
    return runQuery(async () => {
      return prisma.order.create({
        data: {
          buyerId: data.buyerId,
          guestEmail: data.guestEmail,
          totalAmount: data.totalAmount,
          clientRequestId: data.clientRequestId,
          items: {
            createMany: {
              data: data.itemIds.map((mediaItemId) => ({ mediaItemId })),
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

