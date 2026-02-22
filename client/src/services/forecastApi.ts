import { apiClient } from './apiClient';

export interface ForecastDashboardData {
    summary: {
        id: string;
        forecast_month: number;
        forecast_year: number;
        generated_at: string;
        confidence_score: number;
        total_projected_revenue: number;
        total_projected_profit: number;
        status: string;
    };
    products: any[];
    categories: any[];
    cashFlow: {
        projected_inflow: number;
        projected_outflow: number;
        working_capital_requirement: number;
        liquidity_risk_level: string;
    };
    inventoryRisks: any[];
    needsRun?: boolean;
}

export const forecastApi = {
    getDashboard: (month?: number, year?: number) =>
        apiClient.get<ForecastDashboardData>(`/shop/forecast/dashboard${month ? `?month=${month}&year=${year}` : ''}`),

    runForecast: (data: { month: number; year: number; budgetWeight?: number; historyWeight?: number }) =>
        apiClient.post<{ forecastId: string }>('/shop/forecast/run', data),

    getProductForecast: (id: string, month?: number, year?: number) =>
        apiClient.get<any>(`/shop/forecast/product/${id}${month ? `?month=${month}&year=${year}` : ''}`),
};
