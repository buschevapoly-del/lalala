// data-loader.js (исправленная версия)
class DataLoader {
    constructor() {
        this.data = null;
        this.normalizedData = null;
        this.X_train = null;
        this.y_train = null;
        this.X_test = null;
        this.y_test = null;
        this.min = null;
        this.max = null;
        this.dateLabels = [];
        this.returns = [];
        this.trainIndices = [];
        this.testIndices = [];
        this.dataUrl = 'https://raw.githubusercontent.com/buschevapoly-del/again/main/my_data.csv';
        this.insights = {};
    }

    async loadCSVFromGitHub() {
        try {
            const response = await fetch(this.dataUrl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const content = await response.text();
            this.parseCSV(content);
            return this.data;
        } catch (error) {
            throw new Error(`Failed to load data: ${error.message}`);
        }
    }

    parseCSV(content) {
        const lines = content.trim().split('\n');
        const parsedData = [];
        this.dateLabels = [];
        this.returns = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(';');
            if (parts.length >= 2) {
                const dateStr = parts[0].trim();
                const price = parseFloat(parts[1].trim());
                
                if (!isNaN(price) && price > 0 && price < 10000) {
                    parsedData.push({ date: dateStr, price: price });
                    this.dateLabels.push(dateStr);
                }
            }
        }

        // Sort by date
        parsedData.sort((a, b) => {
            const dateA = this.parseDate(a.date);
            const dateB = this.parseDate(b.date);
            return dateA - dateB;
        });
        
        // Calculate returns efficiently
        if (parsedData.length > 1) {
            const returns = new Array(parsedData.length - 1);
            for (let i = 1; i < parsedData.length; i++) {
                const returnVal = (parsedData[i].price - parsedData[i-1].price) / parsedData[i-1].price;
                // Ограничиваем возвраты разумными значениями
                returns[i-1] = Math.max(Math.min(returnVal, 0.5), -0.5);
            }
            this.returns = returns;
        }

        this.data = parsedData;
        
        // Calculate insights
        this.calculateInsights();
        
        if (this.data.length < 65) {
            throw new Error(`Insufficient data. Need at least 65 days, got ${this.data.length}`);
        }
    }

    parseDate(dateStr) {
        const parts = dateStr.split('.');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(dateStr);
    }

    prepareData(windowSize = 60, predictionHorizon = 5, testSplit = 0.2) {
        if (!this.returns || this.returns.length === 0) {
            throw new Error('No data available. Load CSV first.');
        }

        // Убираем NaN и бесконечные значения
        const cleanReturns = this.returns.filter(r => 
            !isNaN(r) && isFinite(r) && Math.abs(r) < 1
        );
        
        if (cleanReturns.length === 0) {
            throw new Error('No valid returns data after cleaning');
        }

        // Нормализация с защитой от деления на ноль
        this.normalizeReturns(cleanReturns);

        const totalSamples = this.normalizedData.length - windowSize - predictionHorizon + 1;
        
        if (totalSamples <= 10) {
            throw new Error(`Not enough samples after cleaning: ${totalSamples}`);
        }

        // Create sequences
        const sequences = [];
        const targets = [];

        for (let i = 0; i < totalSamples; i++) {
            const seq = this.normalizedData.slice(i, i + windowSize).map(v => [v]);
            const target = this.normalizedData.slice(i + windowSize, i + windowSize + predictionHorizon);
            
            // Проверяем на NaN
            if (!seq.some(v => isNaN(v[0])) && !target.some(v => isNaN(v))) {
                sequences.push(seq);
                targets.push(target);
            }
        }

        if (sequences.length === 0) {
            throw new Error('No valid sequences created');
        }

        // Split chronologically
        const splitIdx = Math.floor(sequences.length * (1 - testSplit));
        if (splitIdx === 0) {
            throw new Error('Not enough data for training split');
        }

        // Convert to tensors
        try {
            this.X_train = tf.tensor3d(sequences.slice(0, splitIdx), [splitIdx, windowSize, 1]);
            this.y_train = tf.tensor2d(targets.slice(0, splitIdx), [splitIdx, predictionHorizon]);
            
            if (splitIdx < sequences.length) {
                this.X_test = tf.tensor3d(sequences.slice(splitIdx), [sequences.length - splitIdx, windowSize, 1]);
                this.y_test = tf.tensor2d(targets.slice(splitIdx), [sequences.length - splitIdx, predictionHorizon]);
            }
            
            console.log(`Created ${sequences.length} samples: ${splitIdx} train, ${sequences.length - splitIdx} test`);
            
        } catch (error) {
            console.error('Tensor creation error:', error);
            throw new Error(`Failed to create tensors: ${error.message}`);
        }
        
        return this;
    }

    normalizeReturns(returns) {
        if (!returns || returns.length === 0) {
            throw new Error('No returns data available');
        }

        // Находим min и max с защитой
        const validReturns = returns.filter(r => !isNaN(r) && isFinite(r));
        
        if (validReturns.length === 0) {
            this.min = -0.1;
            this.max = 0.1;
            this.normalizedData = returns.map(() => 0.5);
            return;
        }
        
        this.min = Math.min(...validReturns);
        this.max = Math.max(...validReturns);
        
        // Защита от случая, когда все значения одинаковые
        if (Math.abs(this.max - this.min) < 1e-10) {
            this.min -= 0.01;
            this.max += 0.01;
        }
        
        const range = this.max - this.min;
        this.normalizedData = returns.map(ret => {
            const normalized = (ret - this.min) / range;
            // Ограничиваем значения между 0 и 1
            return Math.max(0, Math.min(1, normalized));
        });
        
        console.log(`Normalization: min=${this.min.toFixed(6)}, max=${this.max.toFixed(6)}`);
    }

    denormalize(value) {
        if (this.min === null || this.max === null) {
            console.warn('Normalization parameters not available, using default');
            return value * 0.02; // Возвращаем небольшое значение
        }
        
        const range = this.max - this.min || 0.02; // Защита от деления на ноль
        const denormalized = value * range + this.min;
        
        // Ограничиваем разумным диапазоном
        return Math.max(Math.min(denormalized, 0.1), -0.1);
    }

    // Остальные методы без изменений...
    calculateInsights() {
        if (!this.data || this.data.length === 0) return;
        
        const prices = this.data.map(d => d.price);
        const returns = this.returns.filter(r => !isNaN(r) && isFinite(r));
        
        // Basic Statistics
        const lastPrice = prices[prices.length - 1];
        const firstPrice = prices[0];
        const totalReturn = (lastPrice - firstPrice) / firstPrice;
        
        // Returns Statistics
        const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length || 0;
        const variance = returns.reduce((sq, n) => sq + Math.pow(n - meanReturn, 2), 0) / returns.length || 0.0001;
        const stdReturn = Math.sqrt(Math.max(variance, 0.000001));
        const annualizedVolatility = stdReturn * Math.sqrt(252);
        
        // Rolling Volatility (20-day)
        const window = 20;
        const rollingVolatilities = [];
        for (let i = window; i <= returns.length; i++) {
            const windowReturns = returns.slice(i - window, i);
            const windowMean = windowReturns.reduce((a, b) => a + b, 0) / window;
            const windowVar = windowReturns.reduce((sq, n) => sq + Math.pow(n - windowMean, 2), 0) / window;
            rollingVolatilities.push(Math.sqrt(Math.max(windowVar, 0)) * Math.sqrt(252));
        }
        
        // SMA calculations
        const sma50 = this.calculateSMA(prices, 50);
        const sma200 = this.calculateSMA(prices, 200);
        const currentTrend = sma50.length > 0 && sma200.length > 0 && 
                           sma50[sma50.length - 1] > sma200[sma200.length - 1] ? 'Bullish' : 'Bearish';
        
        // Maximum Drawdown
        let maxDrawdown = 0;
        let peak = prices[0];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i] > peak) peak = prices[i];
            const drawdown = (peak - prices[i]) / peak;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
        
        this.insights = {
            basic: {
                totalDays: this.data.length,
                dateRange: `${this.data[0].date} to ${this.data[this.data.length - 1].date}`,
                firstPrice: firstPrice.toFixed(2),
                lastPrice: lastPrice.toFixed(2),
                totalReturn: (totalReturn * 100).toFixed(2) + '%',
                maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%'
            },
            returns: {
                meanDailyReturn: (meanReturn * 100).toFixed(4) + '%',
                stdDailyReturn: (stdReturn * 100).toFixed(4) + '%',
                annualizedVolatility: (annualizedVolatility * 100).toFixed(2) + '%',
                sharpeRatio: (meanReturn / Math.max(stdReturn, 0.0001) * Math.sqrt(252)).toFixed(2),
                positiveDays: ((returns.filter(r => r > 0).length / returns.length) * 100).toFixed(1) + '%'
            },
            trends: {
                currentTrend: currentTrend,
                sma50: sma50.length > 0 ? sma50[sma50.length - 1].toFixed(2) : 'N/A',
                sma200: sma200.length > 0 ? sma200[sma200.length - 1].toFixed(2) : 'N/A',
                aboveSMA200: sma200.length > 0 ? (lastPrice > sma200[sma200.length - 1] ? 'Yes' : 'No') : 'N/A',
                trendStrength: sma200.length > 0 ? 
                    Math.abs((sma50[sma50.length - 1] - sma200[sma200.length - 1]) / sma200[sma200.length - 1] * 100).toFixed(2) + '%' : 'N/A'
            },
            volatility: {
                currentRollingVol: rollingVolatilities.length > 0 ? (rollingVolatilities[rollingVolatilities.length - 1] || 0).toFixed(2) + '%' : 'N/A',
                avgRollingVol: rollingVolatilities.length > 0 ? (rollingVolatilities.reduce((a, b) => a + b, 0) / rollingVolatilities.length).toFixed(2) + '%' : 'N/A',
                maxRollingVol: rollingVolatilities.length > 0 ? (Math.max(...rollingVolatilities) || 0).toFixed(2) + '%' : 'N/A',
                minRollingVol: rollingVolatilities.length > 0 ? (Math.min(...rollingVolatilities) || 0).toFixed(2) + '%' : 'N/A'
            },
            rollingVolatilities: rollingVolatilities,
            sma50: sma50,
            sma200: sma200
        };
    }
    
    calculateSMA(prices, period) {
        if (prices.length < period) return [];
        const sma = [];
        for (let i = period - 1; i < prices.length; i++) {
            const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            sma.push(sum / period);
        }
        return sma;
    }

    getHistoricalData() {
        if (!this.data) return null;
        
        return {
            dates: this.dateLabels,
            prices: this.data.map(d => d.price),
            returns: this.returns,
            normalizedReturns: this.normalizedData || []
        };
    }

    getInsights() {
        return this.insights;
    }

    dispose() {
        [this.X_train, this.y_train, this.X_test, this.y_test].forEach(tensor => {
            if (tensor) tensor.dispose();
        });
        this.X_train = this.y_train = this.X_test = this.y_test = this.normalizedData = null;
    }
}

export { DataLoader };
