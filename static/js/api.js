/**
 * WearItNow - API Client Module
 * Communicates with FastAPI backend for garment processing & health checks.
 */

export class ApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    /**
     * Check if backend and models are ready.
     * @returns {Promise<{ready: boolean, models_ready: boolean, error?: string}>}
     */
    async checkHealth() {
        try {
            const res = await fetch(`${this.baseUrl}/api/health`);
            if (!res.ok) {
                return { ready: false, models_ready: false, error: `HTTP ${res.status}` };
            }
            const data = await res.json();
            return {
                ready: true,
                models_ready: Boolean(data.models_ready),
                status: data.status || 'unknown'
            };
        } catch (err) {
            return { ready: false, models_ready: false, error: err.message };
        }
    }

    /**
     * Upload and process garment image.
     * @param {File|Blob} file 
     * @param {'quick'|'ai'} mode 
     * @returns {Promise<any>}
     */
    async processGarment(file, mode = 'quick') {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mode', mode);

        const res = await fetch(`${this.baseUrl}/api/process-garment`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            let detail = `Error ${res.status}`;
            try {
                const errData = await res.json();
                if (errData && errData.detail) detail = errData.detail;
            } catch (_) {}
            throw new Error(detail);
        }

        return await res.json();
    }
}

export const api = new ApiClient();
