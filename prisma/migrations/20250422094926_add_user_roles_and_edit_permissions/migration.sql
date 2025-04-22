-- AlterTable
ALTER TABLE `invoice` ADD COLUMN `editableUntil` DATETIME(3) NOT NULL DEFAULT DATE_ADD(NOW(), INTERVAL 24 HOUR);

-- AlterTable
ALTER TABLE `purchaseorder` ADD COLUMN `allowEditing` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `editableUntil` DATETIME(3) NOT NULL DEFAULT DATE_ADD(NOW(), INTERVAL 24 HOUR);

-- AlterTable
ALTER TABLE `stockregister` ADD COLUMN `allowEditing` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `editableUntil` DATETIME(3) NOT NULL DEFAULT DATE_ADD(NOW(), INTERVAL 24 HOUR),
    MODIFY `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `user` ADD COLUMN `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE `EditRequest` (
    `id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `requestMessage` VARCHAR(191) NULL,
    `responseMessage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `invoiceId` VARCHAR(191) NULL,
    `purchaseOrderId` VARCHAR(191) NULL,
    `stockRegisterId` VARCHAR(191) NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `adminUserId` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EditRequest` ADD CONSTRAINT `EditRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EditRequest` ADD CONSTRAINT `EditRequest_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EditRequest` ADD CONSTRAINT `EditRequest_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EditRequest` ADD CONSTRAINT `EditRequest_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EditRequest` ADD CONSTRAINT `EditRequest_stockRegisterId_fkey` FOREIGN KEY (`stockRegisterId`) REFERENCES `StockRegister`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
