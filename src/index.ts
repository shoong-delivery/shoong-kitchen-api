import 'dotenv/config';
import express, { Request, Response } from 'express';
import axios from 'axios';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import {
  registry,
  kitchenStartTotal,
  kitchenCompleteTotal,
  cookDurationSeconds,
} from './metrics';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors());

// Health Check
app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

// Prometheus 스크랩 엔드포인트
app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } catch (err) {
    console.error('[metrics] error -', (err as Error).message);
    res.status(500).end();
  }
});

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

    kitchenStartTotal.labels('success').inc();
    res.status(201).json({ success: true, data: kitchenOrder });
  } catch (err) {
    kitchenStartTotal.labels('fail').inc();
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// 조리 완료: POST /complete
app.post('/complete', async (req: Request, res: Response) => {
  try {
    const { order_id } = req.body as { order_id: number };

    // 멱등성 가드: 이미 COOKED면 체이닝 호출(상태/알림) 없이 즉시 반환
    // 배치 재시도, 클라이언트 중복 호출 대비
    const existing = await prisma.kitchenOrder.findUnique({ where: { order_id } });
    if (existing?.status === 'COOKED') {
      kitchenCompleteTotal.labels('skipped').inc();
      return res.json({ success: true, skipped: true, data: existing });
    }

    const order = await prisma.order.findUnique({ where: { id: order_id } });

    const kitchenOrder = await prisma.kitchenOrder.update({
      where: { order_id },
      data: {
        status: 'COOKED',
        cook_finished_at: new Date(),
      },
    });

    // 조리 소요시간 히스토그램에 기록
    if (kitchenOrder.cook_started_at && kitchenOrder.cook_finished_at) {
      const seconds =
        (kitchenOrder.cook_finished_at.getTime() - kitchenOrder.cook_started_at.getTime()) / 1000;
      cookDurationSeconds.observe(seconds);
    }

    await axios.patch(`${process.env.ORDER_API_URL}/${order_id}/status`, { status: 'COOKED' });
    await axios.post(`${process.env.DELIVERY_API_URL}/assign`, { order_id });
    await axios.post(`${process.env.NOTIFICATION_API_URL}`, {
      type: 'kitchen',
      message: '조리가 완료되었습니다',
      user_id: order?.user_id,
      order_id,
    });

    kitchenCompleteTotal.labels('success').inc();
    res.json({ success: true, data: kitchenOrder });
  } catch (err) {
    kitchenCompleteTotal.labels('fail').inc();
    console.error(err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

const PORT = process.env.PORT || 3002;
const server = app.listen(PORT, () =>
  console.log(`[kitchen-service] :${PORT}`)
);

process.on('SIGTERM', async () => {
  console.log('[kitchen-service] SIGTERM received, shutting down...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});
