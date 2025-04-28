// src/controller/dashboardController.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Fetches summary counts for the dashboard.
 * Adjusts counts based on user role (Admin sees all, User sees own).
 */
export const getDashboardSummary = async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    console.log(`Fetching dashboard summary for user ${userId} (Role: ${userRole})`);

    try {
        let invoiceWhere = {};
        let poWhere = {};
        let stockWhere = {};
        const editRequestWhere = { status: 'PENDING' };

        if (userRole !== 'ADMIN') {
            const userOwnedFilter = { userId: userId };
            invoiceWhere = { ...invoiceWhere, ...userOwnedFilter };
            poWhere = { ...poWhere, ...userOwnedFilter };
            stockWhere = { ...stockWhere, ...userOwnedFilter };
        }

        const [
            totalInvoices,
            totalPurchaseOrders,
            totalStockEntries,
            pendingEditRequests // Fetch count conditionally
        ] = await prisma.$transaction([
            prisma.invoice.count({ where: invoiceWhere }),
            prisma.purchaseOrder.count({ where: poWhere }),
            prisma.stockRegister.count({ where: stockWhere }),
            userRole === 'ADMIN'
                ? prisma.editRequest.count({ where: editRequestWhere })
                : Promise.resolve(0) // Resolve to 0 if not admin
        ]);

        const summaryData = {
            totalInvoices,
            totalPurchaseOrders,
            totalStockEntries,
            pendingEditRequests // Will be 0 for non-admins
        };

        console.log("Dashboard summary data:", summaryData);
        res.status(200).json(summaryData);

    } catch (error) {
        console.error('❌ Error fetching dashboard summary:', error);
        res.status(500).json({
            message: 'Server Error fetching dashboard data',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
         });
    }
};