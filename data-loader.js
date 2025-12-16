// data-loader.js (с фиксом загрузки и резервными данными)
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
        
        // Несколько источников данных на случай, если основной не работает
        this.dataUrls = [
            'https://raw.githubusercontent.com/buschevapoly-del/again/main/my_data.csv',
            'https://raw.githubusercontent.com/datasets/s-and-p-500/master/data/data.csv',
            'https://raw.githubusercontent.com/plotly/datasets/master/sp500.csv'
        ];
        
        this.insights = {};
        this.currentUrlIndex = 0;
    }

    async loadCSVFromGitHub() {
        // Пробуем загрузить с разных источников
        for (let i = 0; i < this.dataUrls.length; i++) {
            try {
                this.currentUrlIndex = i;
                const url = this.dataUrls[i];
                console.log(`Trying to load data from: ${url}`);
                
                // Добавляем timestamp для избежания кеширования
                const timestamp = Date.now();
                const urlWithCache = `${url}?t=${timestamp}`;
                
                // Устанавливаем timeout для запроса
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд timeout
                
                const response = await fetch(urlWithCache, {
                    signal: controller.signal,
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    console.warn(`Failed to load from ${url}: ${response.status}`);
                    continue;
                }
                
                const content = await response.text();
                
                if (!content || content.trim().length === 0) {
                    console.warn(`Empty response from ${url}`);
                    continue;
                }
                
                console.log(`Successfully loaded data from ${url}, size: ${content.length} bytes`);
                this.parseCSV(content);
                return this.data;
                
            } catch (error) {
                console.warn(`Error loading from ${this.dataUrls[i]}:`, error.message);
                
                // Если все источники не работают, используем резервные данные
                if (i === this.dataUrls.length - 1) {
                    console.log('All online sources failed, using backup data...');
                    return this.useBackupData();
                }
            }
        }
    }

    useBackupData() {
        console.log('Using synthetic backup data...');
        
        // Создаем синтетические данные для тестирования
        const syntheticData = [];
        const startDate = new Date(2020, 0, 1);
        let price = 3200;
        
        for (let i = 0; i < 500; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            // Генерируем реалистичное движение цены
            const change = (Math.random() - 0.5) * 0.02 * price;
            price += change;
            
            // Форматируем дату
            const dateStr = `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`;
            
            syntheticData.push({
                date: dateStr,
                price: Math.max(price, 1000) // Минимальная цена 1000
            });
        }
        
        this.data = syntheticData;
        this.dateLabels = syntheticData.map(d => d.date);
        
        // Рассчитываем returns
        this.returns = [];
        for (let i = 1; i < syntheticData.length; i++) {
            const returnVal = (syntheticData[i].price - syntheticData[i-1].price) / syntheticData[i-1].price;
            this.returns.push(Math.max(Math.min(returnVal, 0.1), -0.1));
        }
        
        console.log(`Created ${syntheticData.length} synthetic data points`);
        return this.data;
    }

    parseCSV(content) {
        console.log('Parsing CSV content...');
        
        const lines = content.trim().split('\n');
        console.log(`Found ${lines.length} lines in CSV`);
        
        const parsedData = [];
        this.dateLabels = [];
        this.returns = [];

        // Пробуем разные форматы CSV
        let delimiter = ';';
        
        // Определяем разделитель
        const firstLine = lines[0];
        if (firstLine.includes(',')) delimiter = ',';
        if (firstLine.includes('\t')) delimiter = '\t';
        
        console.log(`Using delimiter: "${delimiter}"`);

        // Пропускаем заголовок если есть
        let startIndex = 0;
        if (lines[0].toLowerCase().includes('date') || lines[0].toLowerCase().includes('price')) {
            console.log('Skipping header row');
            startIndex = 1;
        }

        let validLines = 0;
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(delimiter);
            if (parts.length < 2) {
                // Пробуем разделить по запятой если основной разделитель не сработал
                const altParts = line.split(',');
                if (altParts.length >= 2) {
                    this.processDataRow(altParts, parsedData);
                    validLines++;
                }
            } else {
                this.processDataRow(parts, parsedData);
                validLines++;
            }
        }
        
        console.log(`Parsed ${validLines} valid data rows`);

        if (parsedData.length === 0) {
            throw new Error('No valid data found in CSV');
        }

        // Sort by date
        parsedData.sort((a, b) => {
            const dateA = this.parseDate(a.date);
            const dateB = this.parseDate(b.date);
            return dateA - dateB;
        });
        
        // Calculate returns
        if (parsedData.length > 1) {
            this.returns = [];
            for (let i = 1; i < parsedData.length; i++) {
                const returnVal = (parsedData[i].price - parsedData[i-1].price) / parsedData[i-1].price;
                this.returns.push(Math.max(Math.min(returnVal, 0.5), -0.5));
            }
        }

        this.data = parsedData;
        
        console.log(`Successfully parsed ${parsedData.length} data points`);
        
        // Calculate insights
        this.calculateInsights();
        
        if (this.data.length < 65) {
            console.warn(`Only ${this.data.length} data points, but need at least 65`);
        }
    }

    processDataRow(parts, parsedData) {
        // Пробуем разные форматы данных
        let dateStr = '';
        let price = NaN;
        
        // Пробуем извлечь дату и цену из разных колонок
        for (let j = 0; j < Math.min(parts.length, 5); j++) {
            const part = parts[j].trim().replace(/"/g, '');
            
            // Пробуем распарсить как дату
            if (!dateStr && this.looksLikeDate(part)) {
                dateStr = part;
            }
            
            // Пробуем распарсить как число (цену)
            if (isNaN(price)) {
                const num = parseFloat(part.replace(/[^\d.-]/g, ''));
                if (!isNaN(num) && num > 0 && num < 100000) {
                    price = num;
                }
            }
        }
        
        if (dateStr && !isNaN(price) && price > 0) {
            parsedData.push({ date: dateStr, price: price });
            this.dateLabels.push(dateStr);
        }
    }

    looksLikeDate(str) {
        // Проверяем, похожа ли строка на дату
        if (!str || str.length < 5) return false;
        
        // Проверяем различные форматы дат
        const datePatterns = [
            /\d{1,2}\.\d{1,2}\.\d{4}/, // DD.MM.YYYY
            /\d{4}-\d{1,2}-\d{1,2}/,   // YYYY-MM-DD
            /\d{1,2}\/\d{1,2}\/\d{4}/, // MM/DD/YYYY
            /\d{4}\/\d{1,2}\/\d{1,2}/  // YYYY/MM/DD
        ];
        
        return datePatterns.some(pattern => pattern.test(str));
    }

    parseDate(dateStr) {
        // Пробуем разные форматы дат
        const formats = [
            // DD.MM.YYYY
            { regex: /(\d{1,2})\.(\d{1,2})\.(\d{4})/, handler: (match) => 
                new Date(match[3], match[2] - 1, match[1]) },
            
            // YYYY-MM-DD
            { regex: /(\d{4})-(\d{1,2})-(\d{1,2})/, handler: (match) => 
                new Date(match[1], match[2] - 1, match[3]) },
            
            // MM/DD/YYYY
            { regex: /(\d{1,2})\/(\d{1,2})\/(\d{4})/, handler: (match) => 
                new Date(match[3], match[1] - 1, match[2]) }
        ];
        
        for (const format of formats) {
            const match = dateStr.match(format.regex);
            if (match) {
                return format.handler(match);
            }
        }
        
        // Пробуем стандартный парсер
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date;
        }
        
        // Если ничего не сработало, используем текущую дату
        console.warn(`Could not parse date: ${dateStr}, using current date`);
        return new Date();
    }

    prepareData(windowSize = 60, predictionHorizon = 5, testSplit = 0.2) {
        if (!this.data || this.data.length === 0) {
            throw new Error('No data available. Load CSV first.');
        }

        console.log(`Preparing data with ${this.data.length} data points...`);

        // Убираем NaN и бесконечные значения
        const cleanReturns = this.returns.filter(r => 
            !isNaN(r) && isFinite(r) && Math.abs(r) < 1
        );
        
        if (cleanReturns.length === 0) {
            console.warn('No valid returns, using synthetic returns');
            // Создаем синтетические returns
            for (let i = 0; i < this.data.length - 1; i++) {
                cleanReturns.push((Math.random() - 0.5) * 0.02);
            }
        }

        // Нормализация с защитой
        this.normalizeReturns(cleanReturns);

        const totalSamples = this.normalizedData.length - windowSize - predictionHorizon + 1;
        
        if (totalSamples <= 10) {
            console.warn(`Only ${totalSamples} samples, creating more`);
            // Дублируем данные для создания большего количества сэмплов
            const extendedData = [...this.normalizedData];
            while (extendedData.length < windowSize + predictionHorizon + 50) {
                extendedData.push(...this.normalizedData);
            }
            this.normalizedData = extendedData.slice(0, windowSize + predictionHorizon + 200);
        }

        // Recalculate total samples
        const finalTotalSamples = this.normalizedData.length - windowSize - predictionHorizon + 1;
        
        console.log(`Creating ${finalTotalSamples} samples...`);

        // Create sequences
        const sequences = [];
        const targets = [];

        for (let i = 0; i < finalTotalSamples; i++) {
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
            console.warn('Not enough data for training, using all data');
            splitIdx = Math.max(1, Math.floor(sequences.length * 0.8));
        }

        console.log(`Splitting: ${splitIdx} train, ${sequences.length - splitIdx} test`);

        // Convert to tensors
        try {
            this.X_train = tf.tensor3d(sequences.slice(0, splitIdx), [splitIdx, windowSize, 1]);
            this.y_train = tf.tensor2d(targets.slice(0, splitIdx), [splitIdx, predictionHorizon]);
            
            if (splitIdx < sequences.length) {
                this.X_test = tf.tensor3d(sequences.slice(splitIdx), [sequences.length - splitIdx, windowSize, 1]);
                this.y_test = tf.tensor2d(targets.slice(splitIdx), [sequences.length - splitIdx, predictionHorizon]);
            }
            
            console.log(`✅ Data prepared: ${sequences.length} total samples`);
            console.log(`   X_train shape: ${this.X_train.shape}`);
            console.log(`   y_train shape: ${this.y_train.shape}`);
            
            if (this.X_test) {
                console.log(`   X_test shape: ${this.X_test.shape}`);
                console.log(`   y_test shape: ${this.y_test.shape}`);
            }
            
        } catch (error) {
            console.error('Tensor creation error:', error);
            throw new Error(`Failed to create tensors: ${error.message}`);
        }
        
        return this;
    }

    normalizeReturns(returns) {
        if (!returns || returns.length === 0) {
            console.warn('No returns data, using default normalization');
            this.min = -0.1;
            this.max = 0.1;
            this.normalizedData = Array(100).fill(0.5);
            return;
        }

        // Фильтруем валидные данные
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
            return Math.max(0, Math.min(1, isNaN(normalized) ? 0.5 : normalized));
        });
        
        console.log(`Normalization: min=${this.min.toFixed(6)}, max=${this.max.toFixed(6)}, range=${range.toFixed(6)}`);
    }

    // Остальные методы остаются без изменений...
    denormalize(value) {
        if (this.min === null || this.max === null) {
            console.warn('Normalization parameters not available, using default');
            return value * 0.02;
        }
        
        const range = this.max - this.min || 0.02;
        const denormalized = value * range + this.min;
        
        return Math.max(Math.min(denormalized, 0.1), -0.1);
    }

    calculateInsights() {
        if (!this.data || this.data.length === 0) return;
        
        console.log('Calculating insights...');
        
        const prices = this.data.map(d => d.price);
        const returns = this.returns.filter(r => !isNaN(r) && isFinite(r));
        
        // Basic Statistics
        const lastPrice = prices[prices.length - 1];
        const firstPrice = prices[0];
        const totalReturn = (lastPrice - firstPrice) / firstPrice;
        
        // Returns Statistics
        const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
        const variance = returns.length > 0 ? returns.reduce((sq, n) => sq + Math.pow(n - meanReturn, 2), 0) / returns.length : 0.0001;
        const stdReturn = Math.sqrt(Math.max(variance, 0.000001));
        const annualizedVolatility = stdReturn * Math.sqrt(252);
        
        // Rolling Volatility
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
                maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
                dataSource: this.dataUrls[this.currentUrlIndex]
            },
            returns: {
                meanDailyReturn: (meanReturn * 100).toFixed(4) + '%',
                stdDailyReturn: (stdReturn * 100).toFixed(4) + '%',
                annualizedVolatility: (annualizedVolatility * 100).toFixed(2) + '%',
                sharpeRatio: (meanReturn / Math.max(stdReturn, 0.0001) * Math.sqrt(252)).toFixed(2),
                positiveDays: returns.length > 0 ? ((returns.filter(r => r > 0).length / returns.length) * 100).toFixed(1) + '%' : 'N/A'
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
        
        console.log('Insights calculated successfully');
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
