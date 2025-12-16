// app.js - версия БЕЗ синтетических данных, только реальные данные из CSV
import { DataLoader } from './data-loader.js';
import { GRUModel } from './gru.js';
import { RandomWalk } from './random-walk.js';

class StockPredictorApp {
    constructor() {
        this.dataLoader = new DataLoader();
        this.gruModel = new GRUModel();
        this.randomWalk = new RandomWalk();
        this.charts = {
            historical: null,
            volatility: null,
            predictions: null,
            comparison: null
        };
        this.isTraining = false;
        this.predictions = null;
        this.rwPredictions = null;
        this.insights = null;
        this.isModelTrained = false;
        this.loadingProgress = 0;
        this.networkOnline = navigator.onLine;
        
        this.initUI();
        this.setupEventListeners();
        this.setupNetworkMonitoring();
        this.autoLoadData();
    }

    initUI() {
        // Обновляем статус сети
        this.updateNetworkStatus();
        
        // Инициализируем прогресс загрузки
        this.updateLoadingProgress('Инициализация приложения...', 0);
        
        // Инициализируем статус тренировки
        document.getElementById('trainingStatus').textContent = 'Готово к обучению';
        
        // Настраиваем состояние кнопок
        document.getElementById('predictBtn').disabled = true;
        document.getElementById('benchmarkBtn').disabled = true;
        document.getElementById('viewDataBtn').disabled = true;
        
        // Скрываем неиспользуемые элементы
        document.getElementById('epochs').style.display = 'none';
        document.getElementById('trainBtn').style.display = 'none';
    }

    setupEventListeners() {
        document.getElementById('loadDataBtn').addEventListener('click', () => this.loadData());
        document.getElementById('viewDataBtn').addEventListener('click', () => this.displayInsights());
        document.getElementById('predictBtn').addEventListener('click', () => this.autoTrainAndPredict());
        document.getElementById('benchmarkBtn').addEventListener('click', () => this.calculateRandomWalkRMSE());
    }

    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.networkOnline = true;
            this.updateNetworkStatus();
            console.log('Сетевое соединение восстановлено');
        });
        
        window.addEventListener('offline', () => {
            this.networkOnline = false;
            this.updateNetworkStatus();
            console.log('Сетевое соединение потеряно');
        });
    }

    updateNetworkStatus() {
        const networkStatus = document.getElementById('networkStatus');
        if (networkStatus) {
            if (this.networkOnline) {
                networkStatus.innerHTML = '<span>🌐</span><span>Online</span>';
                networkStatus.className = 'status-indicator';
            } else {
                networkStatus.innerHTML = '<span>⚠️</span><span>Offline</span>';
                networkStatus.className = 'status-indicator warning';
            }
        }
    }

    updateLoadingProgress(message, percent) {
        this.loadingProgress = percent;
        
        const progressBar = document.getElementById('loadingProgress');
        const details = document.getElementById('loadingDetails');
        const dataStatusIndicator = document.getElementById('dataStatusIndicator');
        
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        
        if (details) {
            details.textContent = message;
        }
        
        if (dataStatusIndicator) {
            dataStatusIndicator.innerHTML = `<span>📊</span><span>${message}</span>`;
            if (percent < 100) {
                dataStatusIndicator.className = 'status-indicator';
            } else {
                dataStatusIndicator.className = 'status-indicator success';
            }
        }
        
        // Обновляем основной статус каждые 25% или при завершении
        if (percent % 25 === 0 || percent === 100) {
            const status = document.getElementById('dataStatus');
            if (status) {
                if (percent < 100) {
                    status.innerHTML = `
                        <div>🚀 ${message} (${percent}%)</div>
                        <div class="progress-container">
                            <div class="progress-bar">
                                <div id="loadingProgress" class="progress-fill" style="width: ${percent}%"></div>
                            </div>
                        </div>
                        <div id="loadingDetails" style="font-size: 0.9rem; margin-top: 5px; color: #ffccd5;">${message}</div>
                    `;
                    status.className = 'status';
                } else {
                    status.innerHTML = `<div>✅ ${message}</div>`;
                    status.className = 'status success';
                }
            }
        }
    }

    async autoLoadData() {
        try {
            this.updateLoadingProgress('Начинаем загрузку данных S&P 500...', 10);
            
            // Загружаем данные из GitHub
            await this.dataLoader.loadCSVFromGitHub();
            this.updateLoadingProgress('Данные успешно загружены', 40);
            
            // Подготавливаем данные для обучения
            await this.sleep(500);
            this.dataLoader.prepareData();
            this.updateLoadingProgress('Данные подготовлены для обучения', 60);
            
            // Обучаем Random Walk модель
            await this.sleep(300);
            this.randomWalk.train(this.dataLoader.returns);
            this.updateLoadingProgress('Random Walk модель обучена', 70);
            
            // Активируем кнопки интерфейса
            document.getElementById('viewDataBtn').disabled = false;
            document.getElementById('predictBtn').disabled = false;
            document.getElementById('benchmarkBtn').disabled = false;
            document.getElementById('loadDataBtn').innerHTML = '🔄 Перезагрузить данные';
            
            // Получаем статистику и создаем графики
            this.insights = this.dataLoader.getInsights();
            this.displayInsights();
            this.createHistoricalChart();
            this.createVolatilityChart();
            
            this.updateLoadingProgress('Все готово!', 100);
            
            // Автоматически обучаем GRU модель
            await this.autoTrainModel();
            
        } catch (error) {
            console.error('Ошибка при загрузке данных:', error);
            
            // Показываем пользователю детальную ошибку
            this.updateStatus('dataStatus', 
                `❌ Ошибка загрузки данных: ${error.message}. Проверьте подключение к интернету и правильность CSV файла.`, 
                'error'
            );
            
            // Отключаем функциональные кнопки при ошибке
            document.getElementById('viewDataBtn').disabled = true;
            document.getElementById('predictBtn').disabled = true;
            document.getElementById('benchmarkBtn').disabled = true;
            
            // Показываем кнопку для повторной попытки
            document.getElementById('loadDataBtn').innerHTML = '🔄 Попробовать снова';
            document.getElementById('loadDataBtn').disabled = false;
        }
    }

    async loadData() {
        try {
            // Сбрасываем состояние
            this.updateLoadingProgress('Перезагрузка данных...', 10);
            this.dataLoader.dispose();
            this.gruModel.dispose();
            this.isModelTrained = false;
            this.predictions = null;
            this.rwPredictions = null;
            
            // Уничтожаем старые графики
            Object.keys(this.charts).forEach(chart => this.destroyChart(chart));
            
            // Очищаем контейнеры
            document.getElementById('metricsContainer').innerHTML = '';
            document.getElementById('predictionsContainer').innerHTML = '';
            
            // Удаляем старый график предсказаний если есть
            const oldChartContainer = document.getElementById('predictionsChartContainer');
            if (oldChartContainer) {
                oldChartContainer.remove();
            }
            
            // Загружаем новые данные
            await this.dataLoader.loadCSVFromGitHub();
            this.updateLoadingProgress('Данные перезагружены', 50);
            
            // Подготавливаем данные
            this.dataLoader.prepareData();
            this.updateLoadingProgress('Данные подготовлены', 70);
            
            // Обучаем Random Walk
            this.randomWalk.train(this.dataLoader.returns);
            this.updateLoadingProgress('Random Walk переобучен', 80);
            
            // Обновляем статистику и графики
            this.insights = this.dataLoader.getInsights();
            this.displayInsights();
            this.createHistoricalChart();
            this.createVolatilityChart();
            
            this.updateLoadingProgress('Перезагрузка завершена', 100);
            
            this.updateStatus('dataStatus', '✅ Данные успешно перезагружены!', 'success');
            
            // Авто-обучение GRU модели
            await this.autoTrainModel();
            
        } catch (error) {
            console.error('Ошибка перезагрузки данных:', error);
            this.updateStatus('dataStatus', 
                `❌ Ошибка: ${error.message}`, 
                'error'
            );
        }
    }

    async autoTrainModel() {
        if (this.isTraining || this.isModelTrained) return;
        
        try {
            this.isTraining = true;
            this.updateStatus('trainingStatus', '🚀 Обучение GRU модели...', 'info');
            
            // Проверяем наличие данных для обучения
            if (!this.dataLoader.X_train || !this.dataLoader.y_train) {
                throw new Error('Отсутствуют данные для обучения модели');
            }
            
            const callbacks = {
                onEpochEnd: (epoch, logs) => {
                    const progress = Math.floor((epoch + 1) / 8 * 100);
                    const progressBar = document.getElementById('progressFill');
                    if (progressBar) {
                        progressBar.style.width = `${progress}%`;
                    }
                    
                    this.updateStatus('trainingStatus', 
                        `⚡ Обучение ${epoch + 1}/8 - Потери: ${logs.loss.toFixed(6)} (${progress}%)`,
                        'info'
                    );
                },
                onTrainEnd: () => {
                    this.isTraining = false;
                    this.isModelTrained = true;
                    const progressBar = document.getElementById('progressFill');
                    if (progressBar) {
                        progressBar.style.width = '100%';
                    }
                    this.updateStatus('trainingStatus', 
                        '✅ GRU модель успешно обучена!',
                        'success'
                    );
                }
            };
            
            // Обучаем модель
            await this.gruModel.train(
                this.dataLoader.X_train, 
                this.dataLoader.y_train, 
                8, 
                callbacks
            );
            
        } catch (error) {
            this.isTraining = false;
            this.isModelTrained = false;
            console.error('Ошибка обучения модели:', error);
            this.updateStatus('trainingStatus', 
                `❌ Ошибка обучения GRU: ${error.message}`,
                'error'
            );
        }
    }

    async autoTrainAndPredict() {
        if (!this.isModelTrained) {
            await this.autoTrainModel();
        }
        
        if (this.isModelTrained) {
            await this.generateAllPredictions();
            this.createPredictionsChart();
        } else {
            this.updateStatus('trainingStatus', 
                '⚠️ Модель еще не обучена. Подождите...',
                'warning'
            );
        }
    }

    async generateAllPredictions() {
        try {
            this.updateStatus('trainingStatus', 'Генерация предсказаний...', 'info');
            
            // Получаем нормализованные данные
            const normalizedData = this.dataLoader.normalizedData;
            const windowSize = this.gruModel.windowSize;
            
            if (!normalizedData || normalizedData.length < windowSize) {
                throw new Error('Недостаточно данных для генерации предсказаний');
            }
            
            // Получаем последнее окно данных
            const lastWindow = normalizedData.slice(-windowSize);
            const lastWindowFormatted = lastWindow.map(v => [v]);
            const inputTensor = tf.tensor3d([lastWindowFormatted], [1, windowSize, 1]);
            
            // Генерируем предсказания с помощью GRU
            const normalizedPredictions = await this.gruModel.predict(inputTensor);
            inputTensor.dispose();
            
            // Денормализуем предсказания
            this.predictions = normalizedPredictions[0].map(p => 
                this.dataLoader.denormalize(p)
            );
            
            // Генерируем предсказания Random Walk
            const lastReturns = this.dataLoader.returns.slice(-windowSize);
            this.rwPredictions = this.randomWalk.predict(lastReturns, 5);
            
            // Отображаем предсказания
            this.displayPredictions();
            
            this.updateStatus('trainingStatus', '✅ Предсказания успешно сгенерированы!', 'success');
            
        } catch (error) {
            console.error('Ошибка генерации предсказаний:', error);
            this.updateStatus('trainingStatus', `❌ ${error.message}`, 'error');
        }
    }

    calculateRandomWalkRMSE() {
        try {
            this.updateStatus('trainingStatus', 'Расчет RMSE для Random Walk...', 'info');
            
            // Получаем исторические данные о доходности
            const returns = this.dataLoader.returns;
            
            if (!returns || returns.length === 0) {
                throw new Error('Нет данных о доходности для расчета RMSE');
            }
            
            // Рассчитываем метрики Random Walk
            const rwResults = this.randomWalk.calculateRMSE(returns, 50);
            
            // Показываем результаты в всплывающем окне
            this.showBenchmarkResults(rwResults);
            
            this.updateStatus('trainingStatus', 
                `✅ RMSE Random Walk: ${(rwResults.rmse * 100).toFixed(3)}%`,
                'success'
            );
            
        } catch (error) {
            console.error('Ошибка расчета бенчмарка:', error);
            this.updateStatus('trainingStatus', 
                '❌ Не удалось рассчитать RMSE',
                'error'
            );
        }
    }

    showBenchmarkResults(results) {
        // Удаляем существующее всплывающее окно если есть
        const existingPopup = document.querySelector('.popup-overlay');
        if (existingPopup) {
            existingPopup.remove();
        }
        
        // Создаем новое всплывающее окно
        const popup = document.createElement('div');
        popup.className = 'popup-overlay';
        popup.innerHTML = `
            <div class="popup-content">
                <h3>📊 Результаты Random Walk Benchmark</h3>
                <div class="results-grid">
                    <div class="result-card">
                        <div class="result-label">RMSE (Root Mean Square Error)</div>
                        <div class="result-value">${(results.rmse * 100).toFixed(3)}%</div>
                    </div>
                    <div class="result-card">
                        <div class="result-label">MAE (Mean Absolute Error)</div>
                        <div class="result-value">${(results.mae * 100).toFixed(3)}%</div>
                    </div>
                    <div class="result-card">
                        <div class="result-label">Точность направления</div>
                        <div class="result-value">${results.directionAccuracy.toFixed(1)}%</div>
                    </div>
                    <div class="result-card">
                        <div class="result-label">Объем выборки</div>
                        <div class="result-value">${results.sampleSize} дней</div>
                    </div>
                </div>
                <p style="color: #ffccd5; font-size: 0.9rem; margin-top: 15px; text-align: center;">
                    RMSE показывает среднюю ошибку предсказания. Чем меньше значение, тем лучше.
                </p>
                <div style="text-align: center; margin-top: 20px;">
                    <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">Закрыть</button>
                </div>
            </div>
        `;
        
        // Добавляем обработчик клика вне окна для закрытия
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                popup.remove();
            }
        });
        
        document.body.appendChild(popup);
    }

    displayInsights() {
        if (!this.insights) {
            console.error('Insights не доступны');
            return;
        }
        
        const metricsContainer = document.getElementById('metricsContainer');
        metricsContainer.innerHTML = '';
        metricsContainer.style.display = 'grid';
        
        // Проверяем наличие всех необходимых данных
        if (!this.insights.basic || !this.insights.returns || !this.insights.trends || !this.insights.volatility) {
            console.error('Неполные insights:', this.insights);
            this.updateStatus('dataStatus', '⚠️ Не удалось рассчитать полную статистику', 'warning');
            return;
        }
        
        const insights = [
            { label: '📈 Общая доходность', value: this.insights.basic.totalReturn || 'N/A' },
            { label: '📉 Максимальная просадка', value: this.insights.basic.maxDrawdown || 'N/A' },
            { label: '📊 Годовая волатильность', value: this.insights.returns.annualizedVolatility || 'N/A' },
            { label: '🎯 Коэффициент Шарпа', value: this.insights.returns.sharpeRatio || 'N/A' },
            { label: '📅 Положительных дней', value: this.insights.returns.positiveDays || 'N/A' },
            { label: '🚦 Текущий тренд', value: this.insights.trends.currentTrend || 'N/A' },
            { label: '📊 SMA 50', value: `$${this.insights.trends.sma50 || 'N/A'}` },
            { label: '📈 SMA 200', value: `$${this.insights.trends.sma200 || 'N/A'}` },
            { label: '⚡ Текущая волатильность', value: this.insights.volatility.currentRollingVol || 'N/A' },
            { label: '📊 Средняя волатильность', value: this.insights.volatility.avgRollingVol || 'N/A' }
        ];
        
        insights.forEach(insight => {
            const card = document.createElement('div');
            card.className = 'insight-card fade-in';
            card.innerHTML = `
                <div class="insight-value">${insight.value}</div>
                <div class="insight-label">${insight.label}</div>
            `;
            metricsContainer.appendChild(card);
        });
    }

    createHistoricalChart() {
        const historicalData = this.dataLoader.getHistoricalData();
        if (!historicalData) {
            console.error('Нет исторических данных для графика');
            return;
        }
        
        // Уничтожаем старый график
        this.destroyChart('historical');
        
        const ctx = document.getElementById('historicalChart').getContext('2d');
        const dates = historicalData.dates;
        const prices = historicalData.prices;
        
        // Ограничиваем количество точек для лучшей производительности
        const maxPoints = 200;
        let step = 1;
        if (dates.length > maxPoints) {
            step = Math.ceil(dates.length / maxPoints);
        }
        
        const sampledDates = dates.filter((_, i) => i % step === 0);
        const sampledPrices = prices.filter((_, i) => i % step === 0);
        
        this.charts.historical = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sampledDates,
                datasets: [{
                    label: 'Цена S&P 500',
                    data: sampledPrices,
                    borderColor: '#ff6b81',
                    backgroundColor: 'rgba(255, 107, 129, 0.05)',
                    borderWidth: 1.5,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Исторические цены S&P 500',
                        color: '#ffccd5',
                        font: { size: 14, weight: 'normal' }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        titleColor: '#ffccd5',
                        bodyColor: '#ffccd5',
                        borderColor: '#ff6b81',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `Цена: $${context.parsed.y.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                })}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#ffccd5',
                            font: { size: 10 },
                            maxTicksLimit: 8
                        },
                        grid: { 
                            color: 'rgba(255,255,255,0.05)',
                            drawBorder: false
                        }
                    },
                    y: {
                        ticks: { 
                            color: '#ffccd5',
                            font: { size: 10 },
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { 
                            color: 'rgba(255,255,255,0.05)',
                            drawBorder: false
                        }
                    }
                }
            }
        });
    }

    createVolatilityChart() {
        if (!this.insights?.rollingVolatilities) {
            console.error('Нет данных о волатильности для графика');
            return;
        }
        
        // Уничтожаем старый график
        this.destroyChart('volatility');
        
        const ctx = document.getElementById('volatilityChart').getContext('2d');
        const volatilities = this.insights.rollingVolatilities;
        
        // Создаем подписи
        const labels = Array.from({ length: volatilities.length }, (_, i) => `День ${i + 1}`);
        
        this.charts.volatility = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '20-дневная скользящая волатильность',
                    data: volatilities.map(v => v * 100),
                    borderColor: '#6495ed',
                    backgroundColor: 'rgba(100, 149, 237, 0.05)',
                    borderWidth: 1.2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0,
                    pointHoverRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Анализ волатильности рынка',
                        color: '#ffccd5',
                        font: { size: 14, weight: 'normal' }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        titleColor: '#ffccd5',
                        bodyColor: '#ffccd5',
                        borderColor: '#6495ed',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `Волатильность: ${context.parsed.y.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#ffccd5',
                            font: { size: 10 },
                            maxTicksLimit: 10
                        },
                        grid: { 
                            color: 'rgba(255,255,255,0.05)',
                            drawBorder: false
                        }
                    },
                    y: {
                        ticks: { 
                            color: '#ffccd5',
                            font: { size: 10 },
                            callback: function(value) {
                                return value.toFixed(1) + '%';
                            }
                        },
                        grid: { 
                            color: 'rgba(255,255,255,0.05)',
                            drawBorder: false
                        }
                    }
                }
            }
        });
    }

    createPredictionsChart() {
        // Удаляем старый контейнер графика если существует
        const oldContainer = document.getElementById('predictionsChartContainer');
        if (oldContainer) {
            oldContainer.remove();
        }
        
        // Создаем новый контейнер для графика предсказаний
        const predictionsCard = document.querySelector('.card:has(#predictionsContainer)');
        const chartContainer = document.createElement('div');
        chartContainer.id = 'predictionsChartContainer';
        chartContainer.className = 'chart-container';
        chartContainer.style.marginTop = '20px';
        chartContainer.style.height = '350px';
        chartContainer.innerHTML = '<canvas id="predictionsChart"></canvas>';
        predictionsCard.appendChild(chartContainer);
        
        // Уничтожаем старый график
        this.destroyChart('predictions');
        
        const ctx = document.getElementById('predictionsChart').getContext('2d');
        
        // Получаем исторические данные
        const historicalData = this.dataLoader.getHistoricalData();
        
        if (!historicalData || !this.predictions || !this.rwPredictions) {
            console.error('Недостаточно данных для графика предсказаний');
            this.createEmptyPredictionsChart(ctx);
            return;
        }
        
        // Берем последние 30 дней исторических данных
        const historicalDays = 30;
        const lastHistoricalDates = historicalData.dates.slice(-historicalDays);
        const lastHistoricalPrices = historicalData.prices.slice(-historicalDays);
        
        // Рассчитываем предсказанные цены
        const lastPrice = lastHistoricalPrices[lastHistoricalPrices.length - 1];
        
        // Предсказания GRU
        let currentGruPrice = lastPrice;
        const gruPrices = [lastPrice];
        this.predictions.forEach(pred => {
            currentGruPrice = currentGruPrice * (1 + pred);
            gruPrices.push(currentGruPrice);
        });
        
        // Предсказания Random Walk
        let currentRwPrice = lastPrice;
        const rwPrices = [lastPrice];
        this.rwPredictions.forEach(pred => {
            currentRwPrice = currentRwPrice * (1 + pred);
            rwPrices.push(currentRwPrice);
        });
        
        // Создаем подписи
        const historicalLabels = lastHistoricalDates.map(date => {
            const d = new Date(date);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });
        
        const predictionLabels = Array.from({ length: 5 }, (_, i) => `+${i + 1}д`);
        const allLabels = [...historicalLabels, ...predictionLabels];
        
        // Создаем наборы данных
        const gruAllPrices = [...lastHistoricalPrices, ...gruPrices.slice(1)];
        const rwAllPrices = [...lastHistoricalPrices, ...rwPrices.slice(1)];
        
        this.charts.predictions = new Chart(ctx, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: 'Историческая цена',
                        data: lastHistoricalPrices,
                        borderColor: '#ffccd5',
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        pointRadius: 0,
                        borderDash: [2, 2]
                    },
                    {
                        label: 'Предсказания GRU',
                        data: gruAllPrices,
                        borderColor: '#90ee90',
                        backgroundColor: 'rgba(144, 238, 144, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0
                    },
                    {
                        label: 'Предсказания Random Walk',
                        data: rwAllPrices,
                        borderColor: '#6495ed',
                        backgroundColor: 'rgba(100, 149, 237, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0,
                        borderDash: [3, 3]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Исторические цены и 5-дневные предсказания',
                        color: '#ffccd5',
                        font: { size: 14, weight: 'normal' }
                    },
                    legend: {
                        labels: {
                            color: '#ffccd5',
                            font: { size: 11 }
                        },
                        position: 'top',
                        align: 'center'
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        titleColor: '#ffccd5',
                        bodyColor: '#ffccd5',
                        borderColor: '#ff6b81',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label && context.parsed.y !== null) {
                                    label += ': $' + context.parsed.y.toFixed(2);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#ffccd5',
                            font: { size: 10 },
                            maxTicksLimit: 15
                        },
                        grid: { 
                            color: 'rgba(255,255,255,0.05)',
                            drawBorder: false
                        }
                    },
                    y: {
                        ticks: { 
                            color: '#ffccd5',
                            font: { size: 10 },
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { 
                            color: 'rgba(255,255,255,0.05)',
                            drawBorder: false
                        }
                    }
                }
            }
        });
    }

    createEmptyPredictionsChart(ctx) {
        this.charts.predictions = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['День 1', 'День 2', 'День 3', 'День 4', 'День 5'],
                datasets: [{
                    label: 'Предсказания недоступны',
                    data: [0, 0, 0, 0, 0],
                    borderColor: '#6c757d',
                    backgroundColor: 'transparent',
                    borderWidth: 1,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Сгенерируйте предсказания для отображения графика',
                        color: '#ffccd5',
                        font: { size: 14 }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    }

    displayPredictions() {
        const container = document.getElementById('predictionsContainer');
        container.innerHTML = '';
        
        // Получаем последнюю цену
        const lastPrice = this.dataLoader.data && this.dataLoader.data.length > 0 ? 
            this.dataLoader.data[this.dataLoader.data.length - 1].price : 0;
        
        if (lastPrice === 0) {
            container.innerHTML = `
                <div class="prediction-card" style="grid-column: 1 / -1;">
                    <div class="prediction-day">Нет данных для отображения</div>
                    <div class="prediction-details">Загрузите данные для генерации предсказаний</div>
                </div>
            `;
            return;
        }
        
        // Отображаем предсказания GRU
        if (this.predictions) {
            let currentGruPrice = lastPrice;
            
            this.predictions.forEach((pred, idx) => {
                const day = idx + 1;
                const returnPct = pred * 100;
                const priceChange = currentGruPrice * pred;
                const newPrice = currentGruPrice + priceChange;
                
                const card = document.createElement('div');
                card.className = 'prediction-card fade-in';
                card.style.animationDelay = `${idx * 0.1}s`;
                card.style.borderColor = '#90ee90';
                card.style.background = 'rgba(144, 238, 144, 0.1)';
                card.innerHTML = `
                    <div class="prediction-day">GRU - День +${day}</div>
                    <div class="prediction-value ${returnPct >= 0 ? 'positive' : 'negative'}">
                        ${returnPct.toFixed(3)}%
                    </div>
                    <div class="prediction-details">
                        Цена: $${newPrice.toFixed(2)}
                    </div>
                    <div class="prediction-details">
                        Изменение: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)}
                    </div>
                `;
                
                container.appendChild(card);
                currentGruPrice = newPrice;
            });
        }
        
        // Отображаем предсказания Random Walk
        if (this.rwPredictions) {
            let currentRwPrice = lastPrice;
            
            this.rwPredictions.forEach((pred, idx) => {
                const day = idx + 1;
                const returnPct = pred * 100;
                const priceChange = currentRwPrice * pred;
                const newPrice = currentRwPrice + priceChange;
                
                const card = document.createElement('div');
                card.className = 'prediction-card fade-in';
                card.style.animationDelay = `${(idx + 5) * 0.1}s`;
                card.style.borderColor = '#6495ed';
                card.style.background = 'rgba(100, 149, 237, 0.1)';
                card.innerHTML = `
                    <div class="prediction-day">Random Walk - День +${day}</div>
                    <div class="prediction-value ${returnPct >= 0 ? 'positive' : 'negative'}">
                        ${returnPct.toFixed(3)}%
                    </div>
                    <div class="prediction-details">
                        Цена: $${newPrice.toFixed(2)}
                    </div>
                    <div class="prediction-details">
                        Изменение: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)}
                    </div>
                `;
                
                container.appendChild(card);
                currentRwPrice = newPrice;
            });
        }
    }

    updateStatus(elementId, message, type = 'info') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = `status ${type}`;
            
            // Обновляем состояние кнопки загрузки
            if (elementId === 'dataStatus') {
                const btn = document.getElementById('loadDataBtn');
                if (btn) {
                    if (message.includes('Загрузка') || message.includes('Loading')) {
                        btn.innerHTML = '<span class="loader"></span> Загрузка...';
                    } else if (message.includes('✅') || message.includes('Готово')) {
                        btn.innerHTML = '🔄 Перезагрузить данные';
                    } else if (message.includes('❌') || message.includes('Ошибка')) {
                        btn.innerHTML = '🔄 Попробовать снова';
                    }
                }
            }
        }
    }

    destroyChart(chartName) {
        if (this.charts[chartName]) {
            try {
                this.charts[chartName].destroy();
                this.charts[chartName] = null;
            } catch (error) {
                console.warn(`Ошибка при уничтожении графика ${chartName}:`, error);
            }
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    dispose() {
        // Освобождаем ресурсы
        this.dataLoader.dispose();
        this.gruModel.dispose();
        this.randomWalk.dispose();
        
        // Уничтожаем все графики
        Object.keys(this.charts).forEach(chart => this.destroyChart(chart));
        
        console.log('Ресурсы приложения освобождены');
    }
}

// Инициализируем приложение при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    window.app = new StockPredictorApp();
    window.addEventListener('beforeunload', () => window.app?.dispose());
});

// Экспортируем для отладки
export { StockPredictorApp };
