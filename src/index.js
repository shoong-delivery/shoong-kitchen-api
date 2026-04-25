require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const app = express();
app.use(express.json());

const cors = require("cors");
app.use(cors());

// Health Check (EKS probe용)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 조리 시작: POST /kitchen/start
app.post('/kitchen/start', async (req, res) => {
  try {
    const { order_id } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: order_id },
    });

    const kitchenOrder = await prisma.kitchenOrder.create({
      data: {
        order_id,
        status: 'COOKING',
        cook_started_at: new Date(),
      },
    });

    await axios.patch(`${process.env.ORDER_URL}/orders/${order_id}/status`, {
      status: 'COOKING',
    });

    await axios.post(`${process.env.NOTIFICATION_URL}/notify`, {
      type: 'kitchen',
      message: '조리가 시작되었습니다',
      user_id: order.user_id,
      order_id,
    });

    res.status(201).json({ success: true, data: kitchenOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 조리 완료: POST /kitchen/complete
app.post('/kitchen/complete', async (req, res) => {
  try {
    const { order_id } = req.body;

    const order = await prisma.order.findUnique({
      where: { id: order_id },
    });

    const kitchenOrder = await prisma.kitchenOrder.update({
      where: { order_id },
      data: {
        status: 'COOKED',
        cook_finished_at: new Date(),
      },
    });

    await axios.patch(`${process.env.ORDER_URL}/orders/${order_id}/status`, {
      status: 'COOKED',
    });

    await axios.post(`${process.env.DELIVERY_URL}/delivery/assign`, {
      order_id,
    });

    await axios.post(`${process.env.NOTIFICATION_URL}/notify`, {
      type: 'kitchen',
      message: '조리가 완료되었습니다',
      user_id: order.user_id,
      order_id,
    });

    res.json({ success: true, data: kitchenOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
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