import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Direct import of app from index.js
import app from '../index.js';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Test data
let userToken;
let userId;
const testDate = new Date().toISOString().split('T')[0];

// Setup test data before running tests
beforeAll(async () => {
  // Create regular user for testing
  const userPassword = await bcrypt.hash('searchtest123', 10);
  const user = await prisma.user.create({
    data: {
      username: 'searchuser',
      password: userPassword,
      role: 'USER',
      email: 'searchuser@example.com'
    }
  });
  userId = user.id;
  userToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
  
  // Create test invoices
  await prisma.invoice.create({
    data: {
      id: 'search-test-invoice-1',
      companyName: 'Search Test Company A',
      vendorName: 'Search Test Vendor A',
      address: '123 Test Address',
      totalAmount: 1500,
      uploadDate: new Date(),
      userId: userId,
      products: {
        create: [
          {
            productName: 'Search Test Product A',
            serialNumber: 'SEARCH-SN-001',
            warrantyYears: 2,
            quantity: 3,
            price: 500
          }
        ]
      }
    }
  });
  
  await prisma.invoice.create({
    data: {
      id: 'search-test-invoice-2',
      companyName: 'Search Test Company B',
      vendorName: 'Search Test Vendor B',
      address: '456 Test Avenue',
      totalAmount: 2500,
      uploadDate: new Date(),
      userId: userId,
      products: {
        create: [
          {
            productName: 'Search Test Product B',
            serialNumber: 'SEARCH-SN-002',
            warrantyYears: 1,
            quantity: 5,
            price: 500
          }
        ]
      }
    }
  });
  
  // Create test purchase orders
  await prisma.purchaseOrder.create({
    data: {
      id: 'search-test-po-1',
      fromAddress: 'Search Test From Address A',
      vendorName: 'Search Test Vendor A',
      purchaseOrderNumber: 'SEARCH-PO-001',
      totalAmount: 3000,
      uploadDate: new Date(),
      userId: userId,
      items: {
        create: [
          {
            description: 'Search Test Item A',
            quantity: 6,
            rate: 500,
            amount: 3000
          }
        ]
      }
    }
  });
  
  // Create test stock register entries
  await prisma.stockRegister.create({
    data: {
      id: 'search-test-stock-1',
      articleName: 'Search Test Article A',
      voucherOrBillNumber: 'SEARCH-V-001',
      costRate: 1200,
      cgst: 120,
      sgst: 120,
      billingDate: new Date(),
      quantity: 2,
      costValue: 2400,
      companyName: 'Search Test Company A',
      productDetails: 'Search test product details',
      uploadDate: new Date(),
      userId: userId
    }
  });
});

// Clean up after tests
afterAll(async () => {
  // Delete test data
  await prisma.product.deleteMany({
    where: {
      invoice: {
        id: {
          startsWith: 'search-test-'
        }
      }
    }
  });
  
  await prisma.item.deleteMany({
    where: {
      purchaseOrder: {
        id: {
          startsWith: 'search-test-'
        }
      }
    }
  });
  
  await prisma.invoice.deleteMany({
    where: {
      id: {
        startsWith: 'search-test-'
      }
    }
  });
  
  await prisma.purchaseOrder.deleteMany({
    where: {
      id: {
        startsWith: 'search-test-'
      }
    }
  });
  
  await prisma.stockRegister.deleteMany({
    where: {
      id: {
        startsWith: 'search-test-'
      }
    }
  });
  
  await prisma.user.deleteMany({
    where: {
      id: userId
    }
  });
  
  await prisma.$disconnect();
});

describe('Advanced Search Tests', () => {
  test('Should search invoices by company name', async () => {
    const res = await request(app)
      .post('/api/search/invoice')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        companyName: 'Search Test Company A'
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body.invoices.length).toBeGreaterThanOrEqual(1);
    expect(res.body.invoices[0].companyName).toBe('Search Test Company A');
  });
  
  test('Should search invoices by vendor name', async () => {
    const res = await request(app)
      .post('/api/search/invoice')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        vendorName: 'Search Test Vendor B'
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body.invoices.length).toBeGreaterThanOrEqual(1);
    expect(res.body.invoices[0].vendorName).toBe('Search Test Vendor B');
  });
  
  test('Should search invoices by date range', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const res = await request(app)
      .post('/api/search/invoice')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        dateFrom: yesterday.toISOString().split('T')[0],
        dateTo: tomorrow.toISOString().split('T')[0]
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body.invoices.length).toBeGreaterThanOrEqual(2);
  });
  
  test('Should search invoices by total amount range', async () => {
    const res = await request(app)
      .post('/api/search/invoice')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        minAmount: 1000,
        maxAmount: 2000
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body.invoices.length).toBeGreaterThanOrEqual(1);
    expect(res.body.invoices[0].totalAmount).toBeLessThanOrEqual(2000);
    expect(res.body.invoices[0].totalAmount).toBeGreaterThanOrEqual(1000);
  });
  
  test('Should search invoices by product name', async () => {
    const res = await request(app)
      .post('/api/search/invoice')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        productName: 'Search Test Product A'
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body.invoices.length).toBeGreaterThanOrEqual(1);
    expect(res.body.invoices[0].products[0].productName).toBe('Search Test Product A');
  });
  
  test('Should search purchase orders by vendor name', async () => {
    const res = await request(app)
      .post('/api/search/purchase-order')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        vendorName: 'Search Test Vendor A'
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body.purchaseOrders.length).toBeGreaterThanOrEqual(1);
    expect(res.body.purchaseOrders[0].vendorName).toBe('Search Test Vendor A');
  });
  
  test('Should search stock register entries by company name', async () => {
    const res = await request(app)
      .post('/api/search/stock-register')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        companyName: 'Search Test Company A'
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body.stockRegisters.length).toBeGreaterThanOrEqual(1);
    expect(res.body.stockRegisters[0].companyName).toBe('Search Test Company A');
  });
  
  test('Should search across all document types', async () => {
    const res = await request(app)
      .post('/api/search/all')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        query: 'Search Test'
      });
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('invoices');
    expect(res.body).toHaveProperty('purchaseOrders');
    expect(res.body).toHaveProperty('stockRegisters');
    expect(res.body.invoices.length + res.body.purchaseOrders.length + res.body.stockRegisters.length).toBeGreaterThanOrEqual(4);
  });
});