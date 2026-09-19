-- Remove the Canteen auth island and its RBAC (users, roles, permissions, SSO sessions).
-- Both are being rebuilt from scratch. Business tables (orders, payments, wallet, POS, menu, members)
-- are untouched; their actor columns (createdBy/staffId/receivedBy/approvedBy) are plain strings.

-- DropForeignKey
ALTER TABLE "canteen_role_permissions" DROP CONSTRAINT "canteen_role_permissions_permissionId_fkey";

-- DropForeignKey
ALTER TABLE "canteen_role_permissions" DROP CONSTRAINT "canteen_role_permissions_roleId_fkey";

-- DropForeignKey
ALTER TABLE "canteen_user_roles" DROP CONSTRAINT "canteen_user_roles_roleId_fkey";

-- DropForeignKey
ALTER TABLE "canteen_user_roles" DROP CONSTRAINT "canteen_user_roles_userId_fkey";

-- DropTable
DROP TABLE "canteen_permissions";

-- DropTable
DROP TABLE "canteen_role_permissions";

-- DropTable
DROP TABLE "canteen_roles";

-- DropTable
DROP TABLE "canteen_sso_sessions";

-- DropTable
DROP TABLE "canteen_user_roles";

-- DropTable
DROP TABLE "canteen_users";

