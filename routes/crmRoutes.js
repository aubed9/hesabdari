const express = require('express');
const router = express.Router();
const crmService = require('../services/crmService');

/**
 * Customer Search Endpoint with Persian Search Normalization
 * Supports both /customers/search and /search with ?q=... or ?search=...
 */
router.get(['/customers/search', '/search'], (req, res) => {
    try {
        const query = req.query.q || req.query.search || '';
        const customers = crmService.searchCustomers(query);
        res.json({ success: true, data: customers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * List / Query Customers
 * Supports both /customers and / with optional ?search=... or ?q=...
 */
router.get(['/customers', '/'], (req, res) => {
    try {
        const query = req.query.search || req.query.q || null;
        const customers = query ? crmService.searchCustomers(query) : crmService.getCustomers();
        res.json({ success: true, data: customers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Customer 360 Profile
 */
router.get(['/customers/:id', '/:id'], (req, res) => {
    try {
        const customer = crmService.getCustomerProfile(req.params.id);
        if (!customer) {
            return res.status(404).json({ success: false, error: 'مشتری یافت نشد' });
        }
        res.json({ success: true, data: customer });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Create Customer
 */
router.post(['/customers', '/'], (req, res) => {
    try {
        const result = crmService.createCustomer(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

/**
 * Update Customer
 */
router.put(['/customers/:id', '/:id'], (req, res) => {
    try {
        const result = crmService.updateCustomer(req.params.id, req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
