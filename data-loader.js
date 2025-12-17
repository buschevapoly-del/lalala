// data-loader.js - Решение проблемы CORS
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
            console.log('Пробую загрузить данные...');
            
            // Вариант 1: Используем GitHub API для обхода CORS
            const apiUrl = 'https://api.github.com/repos/buschevapoly-del/again/contents/my_data.csv';
            
            const response = await fetch(apiUrl, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'StockPredictorApp'
                }
            });
            
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }
            
            const fileData = await response.json();
            
            // Декодируем base64 содержимое
            const csvText = atob(fileData.content);
            
            console.log('Данные получены через GitHub API');
            this.parseCSV(csvText);
            
            if (this.data.length === 0) {
                throw new Error('CSV файл пуст после парсинга');
            }
            
            console.log(`Загружено ${this.data.length} записей`);
            return this.data;
            
        } catch (error) {
            console.error('Ошибка:', error);
            
            // Вариант 2: Если GitHub API не работает, используем CORS proxy
            console.log('Пробую через CORS proxy...');
            
            try {
                // Используем несколько разных proxy
                const proxies = [
                    'https://api.allorigins.win/raw?url=',
                    'https://corsproxy.io/?',
                    'https://thingproxy.freeboard.io/fetch/'
                ];
                
                const targetUrl = 'https://raw.githubusercontent.com/buschevapoly-del/again/main/my_data.csv';
                
                for (const proxy of proxies) {
                    try {
                        const response = await fetch(proxy + encodeURIComponent(targetUrl), {
                            timeout: 10000
                        });
                        
                        if (response.ok) {
                            const csvText = await response.text();
                            this.parseCSV(csvText);
                            
                            if (this.data.length > 0) {
                                console.log(`✅ Данные загружены через proxy: ${proxy}`);
                                return this.data;
                            }
                        }
                    } catch (proxyError) {
                        console.log(`Proxy ${proxy} не сработал:`, proxyError.message);
                    }
                }
                
                throw new Error('Все методы загрузки не сработали');
                
            } catch (proxyError) {
                // Вариант 3: Используем встроенные данные как fallback
                console.log('Использую встроенные данные...');
                
                // Берем первые несколько строк из вашего CSV (уже видимых ранее)
                const csvText = `Date;S&P500
03.01.2000;1455.219970703125
04.01.2000;1399.4200439453125
05.01.2000;1402.1099853515625
06.01.2000;1403.449951171875
07.01.2000;1441.469970703125
10.01.2000;1457.5999755859375
11.01.2000;1438.56005859375
12.01.2000;1432.25
13.01.2000;1449.6800537109375
14.01.2000;1465.1500244140625
18.01.2000;1455.1400146484375
19.01.2000;1455.9000244140625
20.01.2000;1445.5699462890625
21.01.2000;1441.3599853515625
24.01.2000;1401.530029296875
25.01.2000;1410.030029296875
26.01.2000;1404.0899658203125
27.01.2000;1398.56005859375
28.01.2000;1360.1600341796875
31.01.2000;1394.4599609375
01.02.2000;1409.280029296875
02.02.2000;1409.1199951171875
03.02.2000;1424.969970703125
04.02.2000;1424.3699951171875`;
                
                this.parseCSV(csvText);
                console.log(`✅ Использовано ${this.data.length} встроенных записей`);
                
                return this.data;
            }
        }
    }

    parseCSV(csvText) {
        this.data = [];
        const lines = csvText.trim().split('\n');
        
        // Простой парсинг
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
        
        // Рассчитываем returns
        if (this.data.length > 1) {
            this.returns = [];
            for (let i = 1; i < this.data.length; i++) {
                const returnVal = (this.data[i].price - this.data[i-1].price) / this.data[i-1].price;
                this.returns.push(returnVal);
            }
        }
        
        console.log(`Парсинг завершен: ${this.data.length} записей, ${this.returns.length} returns`);
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
        
        // Создаем тренировочные данные
        const windowSize = 60;
        const predictionHorizon = 5;
        
        if (this.normalizedData.length >= windowSize + predictionHorizon) {
            const sequences = [];
            const targets = [];
            
            const samplesCount = Math.min(50, this.normalizedData.length - windowSize - predictionHorizon + 1);
            
            for (let i = 0; i < samplesCount; i++) {
                sequences.push(this.normalizedData.slice(i, i + windowSize).map(v => [v]));
                targets.push(this.normalizedData.slice(i + windowSize, i + windowSize + predictionHorizon));
            }
            
            if (sequences.length > 0) {
                this.X_train = tf.tensor3d(sequences, [sequences.length, windowSize, 1]);
                this.y_train = tf.tensor2d(targets, [targets.length, predictionHorizon]);
            }
        }
    }

    denormalize(value) {
        if (this.min === null || this.max === null) return value * 0.02;
        return value * (this.max - this.min) + this.min;
    }

    getInsights() {
        if (this.data.length === 0) {
            return { 
                basic: { 
                    totalReturn: '0%',
                    totalDays: '0',
                    firstPrice: 'N/A',
                    lastPrice: 'N/A'
                } 
            };
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
