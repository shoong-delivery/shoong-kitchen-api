import 'dotenv/config';
import express, { Request, Response } from 'express';
import axios from 'axios';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors());

// Health Check
app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

// 조리 시작: POST /start
app.post('/start', async (req: Request, res: Response) => {
  try {
    const { order_id } = req.body as { order_id: number };

    const order = await prisma.order.findUnique({ where: { id: order_id } });

    const kitchenOrder = await prisma.kitchenOrder.create({
      data: {
        order_id,
        status: 'COOKING',
        cook_started_at: new Date(),
      },
    });

    await axios.patch(`${process.env.ORDER_API_URL}/${order_id}/status`, { status: 'COOKING' });
    await axios.post(`${process.env.NOTIFICATION_API_URL}`, {
      type: 'kitchen',
      message: '조리가 시작되었습니다',
      user_id: order?.user_id,
      order_id,
    });

    res.status(201).json({ success: true, data: kitchenOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 조리 완료: POST /complete
app.post('/complete', async (req: Request, res: Response) => {
  try {
    const { order_id } = req.body as { order_id: number };

    const order = await prisma.order.findUnique({ where: { id: order_id } });

    const kitchenOrder = await prisma.kitchenOrder.update({
      where: { order_id },
      data: {
        status: 'COOKED',
        cook_finished_at: new Date(),
      },
    });

    await axios.patch(`${process.env.ORDER_API_URL}/${order_id}/status`, { status: 'COOKED' });
    await axios.post(`${process.env.DELIVERY_API_URL}/assign`, { order_id });
    await axios.post(`${process.env.NOTIFICATION_API_URL}`, {
      type: 'kitchen',
      message: '조리가 완료되었습니다',
      user_id: order?.user_id,
      order_id,
    });

    res.json({ success: true, data: kitchenOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

const server = app.listen(process.env.PORT, () =>
  console.log(`[kitchen-service] :${process.env.PORT}`)
);

process.on('SIGTERM', async () => {
  console.log('[kitchen-service] SIGTERM received, shutting down...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});
