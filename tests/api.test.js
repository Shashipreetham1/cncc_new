import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Direct import of app from index.js
import app from '../index.js';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Test data
let adminToken;
let userToken;
let adminId;
let userId;
let invoiceId = 'test-invoice-001';
let purchaseOrderId = 'test-po-001';
let stockRegisterId = 'test-stock-001';
let editRequestId;

// Setup test data before running tests
beforeAll(async () => {
  // Create admin user for testing
  const hashedPassword = await bcrypt.hash('admintest123', 10);
  const admin = await prisma.user.create({
    data: {
      username: 'testadmin',
      password: hashedPassword,
      role: 'ADMIN',
      email: 'testadmin@example.com'  // Added email field
    }
  });
  adminId = admin.id;
  adminToken = jwt.sign({ id: admin.id, role: admin.role }, JWT_SECRET);
  
  // Create regular user for testing
  const userPassword = await bcrypt.hash('usertest123', 10);
  const user = await prisma.user.create({
    data: {
      username: 'testuser',
      password: userPassword,
      role: 'USER',
      email: 'testuser@example.com'  // Added email field
    }
  });
  userId = user.id;
  userToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
});

// Clean up after tests
afterAll(async () => {
  // Delete test data
  await prisma.editRequest.deleteMany({
    where: {
      OR: [
        { invoiceId },
        { purchaseOrderId },
        { stockRegisterId }
      ]
    }
  });
  
  await prisma.product.deleteMany({
    where: { invoiceId }
  });
  
  await prisma.item.deleteMany({
    where: { purchaseOrderId }
  });
  
  await prisma.invoice.deleteMany({
    where: { id: invoiceId }
  });
  
  await prisma.purchaseOrder.deleteMany({
    where: { id: purchaseOrderId }
  });
  
  await prisma.stockRegister.deleteMany({
    where: { id: stockRegisterId }
  });
  
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [adminId, userId]
      }
    }
  });
  
  await prisma.$disconnect();
});

describe('Authentication Tests', () => {
  test('Should login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({
        username: 'testadmin',
        password: 'admintest123'
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
  
  test('Should reject login with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/users/login')
      .send({
        username: 'testadmin',
        password: 'wrongpassword'
      });
      
    expect(res.statusCode).toBe(401);
  });
  
  test('Should get user profile with valid token', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${adminToken}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('username', 'testadmin');
  });
  
  test('Should reject access without token', async () => {
    const res = await request(app)
      .get('/api/users/profile');
      
    expect(res.statusCode).toBe(401);
  });
});

describe('Invoice Tests', () => {
  test('Should create a new invoice', async () => {
    const invoiceData = {
      id: invoiceId,
      companyName: 'Test Company',
      vendorName: 'Test Vendor',
      address: 'Test Address',
      totalAmount: 1000,
      products: [
        {
          productName: 'Test Product',
          serialNumber: 'SN123',
          warrantyYears: 1,
          quantity: 2,
          price: 500
        }
      ]
    };
    
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${userToken}`)
      .send(invoiceData);
      
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id', invoiceId);
  });
  
  test('Should get all invoices', async () => {
    const res = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${userToken}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('invoices');
    expect(Array.isArray(res.body.invoices)).toBe(true);
  });
  
  test('Should get invoice by ID', async () => {
    const res = await request(app)
      .get(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${userToken}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', invoiceId);
  });
  
  test('Should update invoice', async () => {
    const updateData = {
      companyName: 'Updated Company',
      products: [
        {
          productName: 'Updated Product',
          serialNumber: 'SN123',
          warrantyYears: 1,
          quantity: 2,
          price: 500
        }
      ]
    };
    
    const res = await request(app)
      .put(`/api/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send(updateData);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('companyName', 'Updated Company');
  });
  
  test('Should request edit permission', async () => {
    // First, advance the editableUntil date to make it expired
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { 
        editableUntil: new Date(Date.now() - 48 * 60 * 60 * 1000) // 48 hours in the past
      }
    });
    
    const res = await request(app)
      .post(`/api/edit-requests/invoice/${invoiceId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        requestMessage: 'Need to update invoice details'
      });
      
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
    editRequestId = res.body.id;
  });
});

describe('Purchase Order Tests', () => {
  test('Should create a new purchase order', async () => {
    const poData = {
      id: purchaseOrderId,
      fromAddress: 'Test From Address',
      vendorName: 'Test Vendor',
      purchaseOrderNumber: 'PO123',
      totalAmount: 2000,
      items: [
        {
          description: 'Test Item',
          quantity: 4,
          rate: 500,
          amount: 2000
        }
      ]
    };
    
    const res = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send(poData);
      
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id', purchaseOrderId);
  });
  
  test('Should get all purchase orders', async () => {
    const res = await request(app)
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${userToken}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('purchaseOrders');
    expect(Array.isArray(res.body.purchaseOrders)).toBe(true);
  });
});

describe('Stock Register Tests', () => {
  test('Should create a new stock register entry', async () => {
    const stockData = {
      id: stockRegisterId,
      articleName: 'Test Article',
      voucherOrBillNumber: 'V123',
      costRate: 1500,
      cgst: 150,
      sgst: 150,
      billingDate: new Date().toISOString(),
      quantity: 1,
      costValue: 1500,
      companyName: 'Test Company',
      productDetails: 'Test product details'
    };
    
    const res = await request(app)
      .post('/api/stock-register')
      .set('Authorization', `Bearer ${userToken}`)
      .send(stockData);
      
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id', stockRegisterId);
  });
  
  test('Should get all stock register entries', async () => {
    const res = await request(app)
      .get('/api/stock-register')
      .set('Authorization', `Bearer ${userToken}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('stockRegisters');
    expect(Array.isArray(res.body.stockRegisters)).toBe(true);
  });
});

describe('Edit Request Tests', () => {
  test('Should get all edit requests (admin only)', async () => {
    const res = await request(app)
      .get('/api/edit-requests')
      .set('Authorization', `Bearer ${adminToken}`);
      
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
  
  test('Should reject edit request access for regular users', async () => {
    const res = await request(app)
      .get('/api/edit-requests')
      .set('Authorization', `Bearer ${userToken}`);
      
    expect(res.statusCode).toBe(403);
  });
  
  test('Should approve an edit request (admin only)', async () => {
    if (!editRequestId) {
      console.warn('No edit request ID available for testing');
      return;
    }
    
    const res = await request(app)
      .put(`/api/edit-requests/${editRequestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'APPROVED');
  });
  
  test('Should reject an edit request (admin only)', async () => {
    // Create a new edit request for rejection testing
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { 
        editableUntil: new Date(Date.now() - 48 * 60 * 60 * 1000) // 48 hours in the past
      }
    });
    
    const createReq = await request(app)
      .post(`/api/edit-requests/invoice/${invoiceId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        requestMessage: 'Need to reject this request'
      });
    
    const newRequestId = createReq.body.id;
    
    const res = await request(app)
      .put(`/api/edit-requests/${newRequestId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'REJECTED');
  });
});

describe('Saved Search Tests', () => {
  test('Should create a saved search', async () => {
    const searchData = {
      name: 'Test Search',
      type: 'INVOICE',
      criteria: {
        companyName: 'Test Company',
        dateFrom: new Date().toISOString().split('T')[0],
        dateTo: new Date().toISOString().split('T')[0]
      }
    };
    
    const res = await request(app)
      .post('/api/searches/save')
      .set('Authorization', `Bearer ${userToken}`)
      .send(searchData);
      
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('name', 'Test Search');
  });
  
  test('Should get all saved searches', async () => {
    const res = await request(app)
      .get('/api/searches/saved')
      .set('Authorization', `Bearer ${userToken}`);
      
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});