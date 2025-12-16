// data-loader.js - Простая версия, пытается загрузить с GitHub
class DataLoader {
    constructor() {
        this.data = [];
        this.normalizedData = [];
        this.returns = [];
        this.min = null;
        this.max = null;
        this.insights = null;
    }

    async loadCSVFromGitHub() {
        try {
            console.log('Пробую загрузить данные с GitHub...');
            
            // Простая попытка загрузки
            const response = await fetch('https://raw.githubusercontent.com/buschevapoly-del/again/main/my_data.csv', {
                headers: { 'Accept': 'text/csv' },
                mode: 'cors'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const csvText = await response.text();
            console.log('Данные получены, размер:', csvText.length, 'байт');
            
            // Простой парсинг
            this.parseCSV(csvText);
            
            if (this.data.length === 0) {
                throw new Error('CSV файл пуст или некорректен');
            }
            
            console.log(`Загружено ${this.data.length} записей`);
            return this.data;
            
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            throw new Error(`Не удалось загрузить данные: ${error.message}`);
        }
    }

    parseCSV(csvText) {
        this.data = [];
        const lines = csvText.trim().split('\n');
        
        // Пропускаем заголовок
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = line.split(';');
            if (parts.length >= 2 && parts[1].trim() !== '') {
                const price = parseFloat(parts[1].trim());
                if (!isNaN(price) && price > 0) {
                    this.data.push({
                        date: parts[0].trim(),
                        price: price
                    });
                }
            }
        }
        
        // Рассчитываем returns (если есть данные)
        if (this.data.length > 1) {
            this.returns = [];
            for (let i = 1; i < this.data.length; i++) {
                const returnVal = (this.data[i].price - this.data[i-1].price) / this.data[i-1].price;
                this.returns.push(returnVal);
            }
        }
    }

    prepareData() {
        if (this.returns.length === 0) {
            throw new Error('Нет данных для подготовки');
        }
        
        // Простая нормализация
        this.min = Math.min(...this.returns);
        this.max = Math.max(...this.returns);
        const range = this.max - this.min || 0.02;
        
        this.normalizedData = this.returns.map(r => (r - this.min) / range);
        
        // Создаем простые тренировочные данные
        const windowSize = 60;
        const predictionHorizon = 5;
        
        if (this.normalizedData.length >= windowSize + predictionHorizon) {
            const sequences = [];
            const targets = [];
            
            // Просто берем один пример для обучения
            const startIdx = Math.max(0, this.normalizedData.length - windowSize - predictionHorizon);
            
            sequences.push(this.normalizedData.slice(startIdx, startIdx + windowSize).map(v => [v]));
            targets.push(this.normalizedData.slice(startIdx + windowSize, startIdx + windowSize + predictionHorizon));
            
            // Создаем тензоры
            this.X_train = tf.tensor3d(sequences, [sequences.length, windowSize, 1]);
            this.y_train = tf.tensor2d(targets, [targets.length, predictionHorizon]);
        }
    }

    denormalize(value) {
        if (this.min === null || this.max === null) return value * 0.02;
        return value * (this.max - this.min) + this.min;
    }

    getInsights() {
        if (!this.data || this.data.length === 0) {
            return { basic: { totalReturn: 'N/A', error: 'No data loaded' } };
        }
        
        const firstPrice = this.data[0].price;
        const lastPrice = this.data[this.data.length - 1].price;
        const totalReturn = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2);
        
        return {
            basic: {
                totalDays: this.data.length.toString(),
                dateRange: `${this.data[0].date} - ${this.data[this.data.length - 1].date}`,
                firstPrice: `$${firstPrice.toFixed(2)}`,
                lastPrice: `$${lastPrice.toFixed(2)}`,
                totalReturn: `${totalReturn}%`
            }
        };
    }

    dispose() {
        if (this.X_train) this.X_train.dispose();
        if (this.y_train) this.y_train.dispose();
    }
}

export { DataLoader };
