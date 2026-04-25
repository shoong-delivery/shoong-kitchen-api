require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();


const app = express();
app.use(express.json());

// 조리 시작: POST /kitchen/start
app.post('/kitchen/start', async (req, res) => {
  try {
    const { order_id } = req.body;

    // order에서 user_id 조회
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

    // Order 상태 변경
    await axios.patch(`${process.env.ORDER_URL}/orders/${order_id}/status`, {
      status: 'COOKING',
    });

    // Notification 호출
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

    // order에서 user_id 조회
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

    // Order 상태 변경
    await axios.patch(`${process.env.ORDER_URL}/orders/${order_id}/status`, {
      status: 'COOKED',
    });

    // Delivery 호출
    await axios.post(`${process.env.DELIVERY_URL}/delivery/assign`, {
      order_id,
    });

    // Notification 호출
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

app.listen(process.env.PORT, () =>
  console.log(`[kitchen-service] :${process.env.PORT}`)
);