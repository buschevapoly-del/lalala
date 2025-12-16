// data-loader.js - Простой обход CORS через JSONP
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
        return new Promise((resolve, reject) => {
            console.log('Пробуем загрузить данные через proxy...');
            
            // Используем CORS proxy для обхода ограничений
            const proxyUrl = 'https://cors-anywhere.herokuapp.com/';
            const targetUrl = 'https://raw.githubusercontent.com/buschevapoly-del/again/main/my_data.csv';
            
            fetch(proxyUrl + targetUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return response.text();
                })
                .then(csvText => {
                    console.log('Данные получены через proxy');
                    this.parseCSV(csvText);
                    
                    if (this.data.length === 0) {
                        throw new Error('CSV файл пуст');
                    }
                    
                    resolve(this.data);
                })
                .catch(error => {
                    console.error('Ошибка загрузки через proxy:', error);
                    
                    // Если proxy не работает, показываем инструкцию для локального запуска
                    const errorMsg = `
❌ Не удалось загрузить данные напрямую из-за CORS.
   
   Решение:
   1. Откройте ссылку в браузере: https://raw.githubusercontent.com/buschevapoly-del/again/main/my_data.csv
   2. Скопируйте весь текст CSV
   3. Вставьте его в код как строку
   
   ИЛИ
   
   1. Запустите приложение локально через локальный сервер
   2. Разрешите CORS в расширении браузера
                    `;
                    
                    reject(new Error(errorMsg));
                });
        });
    }

    parseCSV(csvText) {
        this.data = [];
        const lines = csvText.trim().split('\n');
        
        // Простой парсинг CSV с разделителем ;
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = line.split(';');
            if (parts.length >= 2 && parts[1].trim() !== '') {
                const price = parseFloat(parts[1].trim());
                if (!isNaN(price)) {
                    this.data.push({
                        date: parts[0].trim(),
                        price: price
                    });
                }
            }
        }
        
        // Рассчитываем returns
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
        
        // Нормализация
        this.min = Math.min(...this.returns);
        this.max = Math.max(...this.returns);
        const range = this.max - this.min || 0.02;
        
        this.normalizedData = this.returns.map(r => (r - this.min) / range);
    }

    denormalize(value) {
        if (this.min === null || this.max === null) return value * 0.02;
        return value * (this.max - this.min) + this.min;
    }

    getInsights() {
        if (this.data.length === 0) {
            return { basic: { totalReturn: 'N/A' } };
        }
        
        const firstPrice = this.data[0].price;
        const lastPrice = this.data[this.data.length - 1].price;
        const totalReturn = ((lastPrice - firstPrice) / firstPrice * 100).toFixed(2);
        
        return {
            basic: {
                totalDays: this.data.length.toString(),
                totalReturn: `${totalReturn}%`,
                firstPrice: firstPrice.toFixed(2),
                lastPrice: lastPrice.toFixed(2)
            }
        };
    }
}

export { DataLoader };
