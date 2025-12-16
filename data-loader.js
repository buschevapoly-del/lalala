// data-loader.js (исправленная версия с правильным парсингом вашего CSV)
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
        this.insights = null;
    }

    async loadCSVFromGitHub() {
        try {
            console.log('Загрузка данных из:', this.dataUrl);
            
            // Добавляем cache busting
            const timestamp = Date.now();
            const urlWithCache = `${this.dataUrl}?t=${timestamp}`;
            
            const response = await fetch(urlWithCache, {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Ошибка HTTP: ${response.status}`);
            }
            
            const content = await response.text();
            console.log('Данные успешно загружены, размер:', content.length, 'байт');
            
            if (!content || content.trim().length === 0) {
                throw new Error('Получен пустой файл');
            }
            
            this.parseCSV(content);
            return this.data;
            
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            throw new Error(`Не удалось загрузить данные: ${error.message}`);
        }
    }

    parseCSV(content) {
        console.log('Начинаем парсинг CSV...');
        
        const lines = content.trim().split('\n');
        console.log('Найдено строк:', lines.length);
        
        const parsedData = [];
        this.dateLabels = [];
        
        // Пропускаем заголовок
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Ваш CSV использует разделитель ';'
            const parts = line.split(';');
            
            // Проверяем, что есть хотя бы 2 колонки
            if (parts.length >= 2) {
                const dateStr = parts[0].trim();
                const priceStr = parts[1].trim();
                
                // Пропускаем пустые строки с ценами
                if (priceStr === '') {
                    console.warn(`Пропущена строка ${i} с пустой ценой`);
                    continue;
                }
                
                const price = parseFloat(priceStr);
                
                if (!isNaN(price) && price > 0) {
                    // Форматируем дату для лучшего отображения
                    const formattedDate = this.formatDate(dateStr);
                    
                    parsedData.push({ 
                        date: formattedDate, 
                        price: price,
                        originalDate: dateStr
                    });
                    
                    this.dateLabels.push(formattedDate);
                } else {
                    console.warn(`Некорректная цена в строке ${i}: ${priceStr}`);
                }
            }
        }
        
        console.log(`Успешно распарсено ${parsedData.length} записей`);
        
        if (parsedData.length === 0) {
            throw new Error('Не найдено валидных данных в CSV файле');
        }
        
        // Сортируем по дате (хотя данные уже могут быть отсортированы)
        parsedData.sort((a, b) => {
            const dateA = this.parseDate(a.originalDate);
            const dateB = this.parseDate(b.originalDate);
            return dateA - dateB;
        });
        
        // Обновляем dateLabels после сортировки
        this.dateLabels = parsedData.map(d => d.date);
        
        this.data = parsedData;
        
        // Рассчитываем returns (дневные изменения)
        this.calculateReturns();
        
        // Создаем insights
        this.calculateInsights();
        
        console.log('✅ Данные успешно обработаны');
    }

    formatDate(dateStr) {
        // Преобразуем DD.MM.YYYY в YYYY-MM-DD для лучшего отображения
        const parts = dateStr.split('.');
        if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return dateStr;
    }

    parseDate(dateStr) {
        // Парсим дату в формате DD.MM.YYYY
        const parts = dateStr.split('.');
        if (parts.length === 3) {
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(dateStr);
    }

    calculateReturns() {
        if (!this.data || this.data.length < 2) {
            this.returns = [];
            return;
        }
        
        this.returns = [];
        for (let i = 1; i < this.data.length; i++) {
            const currentPrice = this.data[i].price;
            const previousPrice = this.data[i-1].price;
            const dailyReturn = (currentPrice - previousPrice) / previousPrice;
            
            // Ограничиваем экстремальные значения
            const safeReturn = Math.max(Math.min(dailyReturn, 0.1), -0.1);
            this.returns.push(safeReturn);
        }
        
        console.log(`Рассчитано ${this.returns.length} дневных изменений`);
    }

    calculateInsights() {
        if (!this.data || this.data.length === 0) {
            console.error('Нет данных для расчета insights');
            this.insights = this.createEmptyInsights();
            return;
        }
        
        const prices = this.data.map(d => d.price);
        const returns = this.returns;
        
        // Базовые статистики
        const firstPrice = prices[0];
        const lastPrice = prices[prices.length - 1];
        const totalReturn = (lastPrice - firstPrice) / firstPrice;
        
        // Статистика returns
        const meanReturn = returns.length > 0 ? 
            returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;
        
        const variance = returns.length > 0 ?
            returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length : 0.0001;
        
        const stdReturn = Math.sqrt(Math.max(variance, 0.000001));
        const annualizedVolatility = stdReturn * Math.sqrt(252);
        
        // Скользящая волатильность (20 дней)
        const rollingVolatilities = this.calculateRollingVolatility(returns, 20);
        
        // SMA (скользящие средние)
        const sma50 = this.calculateSMA(prices, 50);
        const sma200 = this.calculateSMA(prices, 200);
        
        // Определяем тренд
        let currentTrend = 'Neutral';
        if (sma50.length > 0 && sma200.length > 0) {
            currentTrend = sma50[sma50.length - 1] > sma200[sma200.length - 1] ? 'Bullish' : 'Bearish';
        }
        
        // Максимальная просадка
        let maxDrawdown = 0;
        let peak = prices[0];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i] > peak) peak = prices[i];
            const drawdown = (peak - prices[i]) / peak;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
        
        // Сохраняем insights
        this.insights = {
            basic: {
                totalDays: this.data.length,
                dateRange: `${this.data[0].date} - ${this.data[this.data.length - 1].date}`,
                firstPrice: `$${firstPrice.toFixed(2)}`,
                lastPrice: `$${lastPrice.toFixed(2)}`,
                totalReturn: `${(totalReturn * 100).toFixed(2)}%`,
                maxDrawdown: `${(maxDrawdown * 100).toFixed(2)}%`
            },
            returns: {
                meanDailyReturn: `${(meanReturn * 100).toFixed(4)}%`,
                stdDailyReturn: `${(stdReturn * 100).toFixed(4)}%`,
                annualizedVolatility: `${(annualizedVolatility * 100).toFixed(2)}%`,
                sharpeRatio: (meanReturn / Math.max(stdReturn, 0.0001) * Math.sqrt(252)).toFixed(2),
                positiveDays: returns.length > 0 ? 
                    `${((returns.filter(r => r > 0).length / returns.length) * 100).toFixed(1)}%` : '0%'
            },
            trends: {
                currentTrend: currentTrend,
                sma50: sma50.length > 0 ? sma50[sma50.length - 1].toFixed(2) : 'N/A',
                sma200: sma200.length > 0 ? sma200[sma200.length - 1].toFixed(2) : 'N/A',
                aboveSMA200: sma200.length > 0 ? 
                    (lastPrice > sma200[sma200.length - 1] ? 'Yes' : 'No') : 'N/A'
            },
            volatility: {
                currentRollingVol: rollingVolatilities.length > 0 ? 
                    `${(rollingVolatilities[rollingVolatilities.length - 1] * 100).toFixed(2)}%` : 'N/A',
                avgRollingVol: rollingVolatilities.length > 0 ? 
                    `${(rollingVolatilities.reduce((a, b) => a + b, 0) / rollingVolatilities.length * 100).toFixed(2)}%` : 'N/A'
            },
            rollingVolatilities: rollingVolatilities,
            sma50: sma50,
            sma200: sma200
        };
        
        console.log('✅ Insights успешно рассчитаны');
    }

    calculateRollingVolatility(returns, window) {
        if (returns.length < window) return [];
        
        const volatilities = [];
        for (let i = window; i <= returns.length; i++) {
            const windowReturns = returns.slice(i - window, i);
            const windowMean = windowReturns.reduce((sum, r) => sum + r, 0) / window;
            const windowVariance = windowReturns.reduce((sum, r) => sum + Math.pow(r - windowMean, 2), 0) / window;
            const windowStd = Math.sqrt(Math.max(windowVariance, 0));
            volatilities.push(windowStd * Math.sqrt(252));
        }
        
        return volatilities;
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

    createEmptyInsights() {
        return {
            basic: {
                totalDays: '0',
                dateRange: 'N/A',
                firstPrice: 'N/A',
                lastPrice: 'N/A',
                totalReturn: 'N/A',
                maxDrawdown: 'N/A'
            },
            returns: {
                meanDailyReturn: 'N/A',
                stdDailyReturn: 'N/A',
                annualizedVolatility: 'N/A',
                sharpeRatio: 'N/A',
                positiveDays: 'N/A'
            },
            trends: {
                currentTrend: 'N/A',
                sma50: 'N/A',
                sma200: 'N/A',
                aboveSMA200: 'N/A'
            },
            volatility: {
                currentRollingVol: 'N/A',
                avgRollingVol: 'N/A'
            },
            rollingVolatilities: [],
            sma50: [],
            sma200: []
        };
    }

    prepareData(windowSize = 60, predictionHorizon = 5, testSplit = 0.2) {
        if (!this.data || this.data.length === 0) {
            throw new Error('Нет данных для подготовки. Сначала загрузите данные.');
        }
        
        if (!this.returns || this.returns.length === 0) {
            throw new Error('Нет данных о дневных изменениях.');
        }
        
        console.log('Подготовка данных для обучения...');
        
        // Нормализуем returns
        this.normalizeReturns();
        
        const totalSamples = this.normalizedData.length - windowSize - predictionHorizon + 1;
        
        if (totalSamples <= 10) {
            throw new Error(`Недостаточно сэмплов: ${totalSamples}. Нужно больше данных.`);
        }
        
        // Создаем последовательности
        const sequences = [];
        const targets = [];
        
        for (let i = 0; i < totalSamples; i++) {
            const sequence = this.normalizedData.slice(i, i + windowSize).map(v => [v]);
            const target = this.normalizedData.slice(i + windowSize, i + windowSize + predictionHorizon);
            
            sequences.push(sequence);
            targets.push(target);
        }
        
        console.log(`Создано ${sequences.length} сэмплов`);
        
        // Разделяем на train/test
        const splitIdx = Math.floor(sequences.length * (1 - testSplit));
        
        // Создаем тензоры TensorFlow.js
        this.X_train = tf.tensor3d(sequences.slice(0, splitIdx), [splitIdx, windowSize, 1]);
        this.y_train = tf.tensor2d(targets.slice(0, splitIdx), [splitIdx, predictionHorizon]);
        
        if (splitIdx < sequences.length) {
            this.X_test = tf.tensor3d(sequences.slice(splitIdx), [sequences.length - splitIdx, windowSize, 1]);
            this.y_test = tf.tensor2d(targets.slice(splitIdx), [sequences.length - splitIdx, predictionHorizon]);
        }
        
        console.log('✅ Данные подготовлены для обучения');
        console.log(`  X_train: ${this.X_train.shape}`);
        console.log(`  y_train: ${this.y_train.shape}`);
        
        return this;
    }

    normalizeReturns() {
        if (!this.returns || this.returns.length === 0) {
            throw new Error('Нет данных для нормализации');
        }
        
        // Фильтруем валидные значения
        const validReturns = this.returns.filter(r => !isNaN(r) && isFinite(r));
        
        if (validReturns.length === 0) {
            throw new Error('Нет валидных данных для нормализации');
        }
        
        this.min = Math.min(...validReturns);
        this.max = Math.max(...validReturns);
        
        // Защита от случая, когда все значения одинаковые
        const range = this.max - this.min || 0.02;
        
        this.normalizedData = this.returns.map(ret => {
            const normalized = (ret - this.min) / range;
            return Math.max(0, Math.min(1, normalized));
        });
        
        console.log(`Нормализация: min=${this.min.toFixed(6)}, max=${this.max.toFixed(6)}`);
    }

    denormalize(value) {
        if (this.min === null || this.max === null) {
            console.warn('Параметры нормализации не найдены');
            return value * 0.02;
        }
        
        const range = this.max - this.min || 0.02;
        return value * range + this.min;
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
        if (!this.insights) {
            console.warn('Insights не были рассчитаны');
            return this.createEmptyInsights();
        }
        return this.insights;
    }

    getDataSummary() {
        if (!this.data || this.data.length === 0) {
            return { count: 0, message: 'Нет данных' };
        }
        
        return {
            count: this.data.length,
            dateRange: `${this.data[0].date} - ${this.data[this.data.length - 1].date}`,
            priceRange: `$${Math.min(...this.data.map(d => d.price)).toFixed(2)} - $${Math.max(...this.data.map(d => d.price)).toFixed(2)}`
        };
    }

    dispose() {
        // Освобождаем тензоры TensorFlow.js
        if (this.X_train) this.X_train.dispose();
        if (this.y_train) this.y_train.dispose();
        if (this.X_test) this.X_test.dispose();
        if (this.y_test) this.y_test.dispose();
        
        this.X_train = this.y_train = this.X_test = this.y_test = null;
        this.normalizedData = null;
        
        console.log('Ресурсы DataLoader освобождены');
    }
}

export { DataLoader };
