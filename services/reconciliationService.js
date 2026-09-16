// Reconciliation Service - Data Integrity Verification Engine
const db = require("../db/database");

const reconciliationService = {
    runAll() {
        const results = [];
        results.push(this.checkJournalBalance());
        results.push(this.checkNegativeInventory());
        results.push(this.checkReservedExceedsQuantity());
        results.push(this.checkNegativeWallet());
        results.push(this.checkPaymentTotals());
        results.push(this.checkWalletReconciliation());
        results.push(this.checkLoyaltyReconciliation());
        results.push(this.checkOverallGLBalance());
        return {
            timestamp: new Date().toISOString(),
            summary: {
                total: results.length,
                critical: results.filter(r => r.severity === "CRITICAL").length,
                warning: results.filter(r => r.severity === "WARNING").length,
                info: results.filter(r => r.severity === "INFO").length,
                ok: results.filter(r => r.severity === "OK").length
            },
            checks: results
        };
    },

    checkJournalBalance() {
        const sql = "SELECT je.id, je.entry_number, je.description, " +
            "SUM(jl.debit) AS total_debit, SUM(jl.credit) AS total_credit, " +
            "ABS(SUM(jl.debit) - SUM(jl.credit)) AS imbalance " +
            "FROM journal_entries je JOIN journal_lines jl ON je.id = jl.journal_entry_id " +
            "GROUP BY je.id HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.01";
        const rows = db.prepare(sql).all();
        if (rows.length === 0) return { check: "JOURNAL_BALANCE", severity: "OK", message: "All journal entries are balanced", details: [] };
        return { check: "JOURNAL_BALANCE", severity: "CRITICAL", message: rows.length + " unbalanced journal entries found", details: rows };
    },

    checkNegativeInventory() {
        const sql = "SELECT ib.id, ib.batch_number, ib.quantity, pv.sku, p.name_fa AS product_name " +
            "FROM inventory_batches ib JOIN product_variants pv ON ib.product_variant_id = pv.id " +
            "JOIN products p ON pv.product_id = p.id WHERE ib.quantity < 0";
        const rows = db.prepare(sql).all();
        if (rows.length === 0) return { check: "NEGATIVE_INVENTORY", severity: "OK", message: "No negative inventory batches", details: [] };
        return { check: "NEGATIVE_INVENTORY", severity: "CRITICAL", message: rows.length + " batches with negative quantity", details: rows };
    },

    checkReservedExceedsQuantity() {
        const sql = "SELECT ib.id, ib.batch_number, ib.quantity, ib.reserved_quantity, pv.sku " +
            "FROM inventory_batches ib JOIN product_variants pv ON ib.product_variant_id = pv.id " +
            "WHERE ib.reserved_quantity > ib.quantity";
        const rows = db.prepare(sql).all();
        if (rows.length === 0) return { check: "RESERVED_EXCEEDS_QUANTITY", severity: "OK", message: "All reservations within bounds", details: [] };
        return { check: "RESERVED_EXCEEDS_QUANTITY", severity: "CRITICAL", message: rows.length + " batches where reserved > quantity", details: rows };
    },

    checkNegativeWallet() {
        const rows = db.prepare("SELECT id, full_name, mobile, wallet_balance FROM customers WHERE wallet_balance < 0").all();
        if (rows.length === 0) return { check: "NEGATIVE_WALLET", severity: "OK", message: "No negative wallet balances", details: [] };
        return { check: "NEGATIVE_WALLET", severity: "CRITICAL", message: rows.length + " customers with negative wallet", details: rows };
    },

    checkPaymentTotals() {
        const sql = "SELECT o.id, o.order_number, o.total_amount, o.payment_status, " +
            "COALESCE(SUM(p.amount),0) AS total_paid " +
            "FROM orders o LEFT JOIN payments p ON o.id = p.order_id " +
            "WHERE o.payment_status = 'PAID' AND o.status = 'COMPLETED' " +
            "GROUP BY o.id HAVING COALESCE(SUM(p.amount),0) < o.total_amount - 0.01";
        const rows = db.prepare(sql).all();
        if (rows.length === 0) return { check: "PAYMENT_TOTALS", severity: "OK", message: "All PAID orders have sufficient payments", details: [] };
        return { check: "PAYMENT_TOTALS", severity: "CRITICAL", message: rows.length + " PAID orders with insufficient payments", details: rows };
    },

    checkWalletReconciliation() {
        const sql = "SELECT c.id, c.full_name, c.wallet_balance AS stored, " +
            "COALESCE(SUM(wt.amount),0) AS computed, " +
            "c.wallet_balance - COALESCE(SUM(wt.amount),0) AS drift " +
            "FROM customers c LEFT JOIN wallet_transactions wt ON c.id = wt.customer_id " +
            "GROUP BY c.id HAVING ABS(c.wallet_balance - COALESCE(SUM(wt.amount),0)) > 0.01";
        const rows = db.prepare(sql).all();
        if (rows.length === 0) return { check: "WALLET_RECONCILIATION", severity: "OK", message: "All wallet balances match transactions", details: [] };
        return { check: "WALLET_RECONCILIATION", severity: "WARNING", message: rows.length + " customers with wallet drift", details: rows };
    },

    checkLoyaltyReconciliation() {
        const sql = "SELECT c.id, c.full_name, c.loyalty_points AS stored, " +
            "COALESCE(SUM(lt.points),0) AS computed, " +
            "c.loyalty_points - COALESCE(SUM(lt.points),0) AS drift " +
            "FROM customers c LEFT JOIN loyalty_transactions lt ON c.id = lt.customer_id " +
            "GROUP BY c.id HAVING ABS(c.loyalty_points - COALESCE(SUM(lt.points),0)) > 0";
        const rows = db.prepare(sql).all();
        if (rows.length === 0) return { check: "LOYALTY_RECONCILIATION", severity: "OK", message: "All loyalty points match transactions", details: [] };
        return { check: "LOYALTY_RECONCILIATION", severity: "WARNING", message: rows.length + " customers with loyalty drift", details: rows };
    },

    checkOverallGLBalance() {
        const sql = "SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit, " +
            "ABS(SUM(debit) - SUM(credit)) AS imbalance " +
            "FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id = je.id " +
            "WHERE je.is_posted = 1";
        const row = db.prepare(sql).get();
        if (!row || row.imbalance <= 0.01) return { check: "OVERALL_GL_BALANCE", severity: "OK", message: "General Ledger is balanced", details: row || {} };
        return { check: "OVERALL_GL_BALANCE", severity: "CRITICAL", message: "General Ledger out of balance by " + row.imbalance, details: row };
    }
};

module.exports = reconciliationService;
