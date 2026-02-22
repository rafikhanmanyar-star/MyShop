import express from 'express';
import { getForecastService } from '../../services/ForecastService.js';

const router = express.Router();

// Get forecast dashboard
router.get('/dashboard', async (req: any, res) => {
    try {
        const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
        const year = parseInt(req.query.year as string) || (new Date().getFullYear());

        const dashboard = await getForecastService().getForecastDashboard(req.tenantId, month, year);
        if (!dashboard) {
            return res.json({
                needsRun: true,
                message: 'No forecast found for this month'
            });
        }
        res.json(dashboard);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Run forecast
router.post('/run', async (req: any, res) => {
    try {
        const { month, year, budgetWeight, historyWeight } = req.body;
        const targetMonth = month || (new Date().getMonth() + 1);
        const targetYear = year || (new Date().getFullYear());

        const result = await getForecastService().runBudgetForecast(req.tenantId, targetMonth, targetYear, {
            budgetWeight: budgetWeight || 0.7,
            historyWeight: historyWeight || 0.3
        });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get specific product forecast
router.get('/product/:id', async (req: any, res) => {
    try {
        const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);
        const year = parseInt(req.query.year as string) || (new Date().getFullYear());

        const forecast = await getForecastService().getProductForecast(req.tenantId, req.params.id, month, year);
        res.json(forecast);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
