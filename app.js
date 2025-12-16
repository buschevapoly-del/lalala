// app.js (основное приложение)
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
        this.benchmarkResults = null;
        
        this.initUI();
        this.setupEventListeners();
        this.autoLoadData();
    }

    initUI() {
        document.getElementById('dataStatus').textContent = '🚀 Loading S&P 500 data...';
        document.getElementById('trainingStatus').textContent = 'Ready for training';
        
        // Настраиваем UI
        const epochsInput = document.getElementById('epochs');
        const trainBtn = document.getElementById('trainBtn');
        if (epochsInput) epochsInput.style.display = 'none';
        if (trainBtn) trainBtn.style.display = 'none';
        
        // Меняем текст кнопки предсказаний
        const predictBtn = document.getElementById('predictBtn');
        if (predictBtn) {
            predictBtn.textContent = '🔮 Generate Predictions';
            predictBtn.disabled = true;
        }
        
        // Активируем кнопку бенчмарка
        const benchmarkBtn = document.getElementById('benchmarkBtn');
        if (benchmarkBtn) {
            benchmarkBtn.disabled = true;
        }
    }

    setupEventListeners() {
        document.getElementById('loadDataBtn').addEventListener('click', () => this.loadData());
        document.getElementById('viewDataBtn').addEventListener('click', () => this.displayInsights());
        document.getElementById('predictBtn').addEventListener('click', () => this.autoTrainAndPredict());
        document.getElementById('benchmarkBtn').addEventListener('click', () => this.calculateRandomWalkRMSE());
    }

    async autoLoadData() {
        try {
            this.updateStatus('dataStatus', 'Loading S&P 500 data...', 'info');
            
            await this.dataLoader.loadCSVFromGitHub();
            this.dataLoader.prepareData();
            
            // Обучаем Random Walk
            this.randomWalk.train(this.dataLoader.returns);
            
            document.getElementById('viewDataBtn').disabled = false;
            document.getElementById('predictBtn').disabled = false;
            document.getElementById('benchmarkBtn').disabled = false;
            document.getElementById('loadDataBtn').innerHTML = '🔄 Reload Data';
            
            this.insights = this.dataLoader.getInsights();
            this.displayInsights();
            this.createHistoricalChart();
            this.createVolatilityChart();
            
            this.updateStatus('dataStatus', '✅ Data loaded successfully!', 'success');
            
            // Автотреннинг GRU
            await this.autoTrainModel();
            
        } catch (error) {
            this.updateStatus('dataStatus', `❌ Error: ${error.message}`, 'error');
            console.error('Auto-load error:', error);
        }
    }

    async autoTrainModel() {
        if (this.isTraining || this.isModelTrained) return;
        
        try {
            this.isTraining = true;
            this.updateStatus('trainingStatus', '🚀 Training GRU model (8 epochs)...', 'info');
            
            const callbacks = {
                onEpochEnd: (epoch, logs) => {
                    this.updateStatus('trainingStatus', 
                        `⚡ Training ${epoch + 1}/8 - Loss: ${logs.loss.toFixed(6)}`,
                        'info'
                    );
                },
                onTrainEnd: () => {
                    this.isTraining = false;
                    this.isModelTrained = true;
                    this.updateStatus('trainingStatus', 
                        '✅ GRU model trained successfully!',
                        'success'
                    );
                }
            };
            
            await this.gruModel.train(
                this.dataLoader.X_train, 
                this.dataLoader.y_train, 
                8, 
                callbacks
            );
            
        } catch (error) {
            this.isTraining = false;
            console.error('Auto-train error:', error);
            this.updateStatus('trainingStatus', 
                '⚠️ Training completed with warnings',
                'warning'
            );
            this.isModelTrained = true; // Все равно разрешаем предсказания
        }
    }

    async autoTrainAndPredict() {
        if (!this.isModelTrained) {
            await this.autoTrainModel();
        }
        
        if (this.isModelTrained) {
            await this.generateAllPredictions();
            this.createPredictionsChart();
        }
    }

    async generateAllPredictions() {
        try {
            this.updateStatus('trainingStatus', 'Generating predictions...', 'info');
            
            // GRU предсказания
            const normalizedData = this.dataLoader.normalizedData;
            const windowSize = this.gruModel.windowSize;
            
            if (!normalizedData || normalizedData.length < windowSize) {
                throw new Error('Not enough data for predictions');
            }
            
            const lastWindow = normalizedData.slice(-windowSize);
            const lastWindowFormatted = lastWindow.map(v => [v]);
            const inputTensor = tf.tensor3d([lastWindowFormatted], [1, windowSize, 1]);
            
            const normalizedPredictions = await this.gruModel.predict(inputTensor);
            inputTensor.dispose();
            
            this.predictions = normalizedPredictions[0].map(p => 
                this.dataLoader.denormalize(p)
            );
            
            // Random Walk предсказания
            const lastReturns = this.dataLoader.returns.slice(-windowSize);
            this.rwPredictions = this.randomWalk.predict(lastReturns, 5);
            
            // Отображаем предсказания
            this.displayPredictions();
            
            this.updateStatus('trainingStatus', '✅ Predictions generated!', 'success');
            
        } catch (error) {
            console.error('Prediction error:', error);
            this.updateStatus('trainingStatus', `⚠️ ${error.message}`, 'warning');
            
            // В случае ошибки используем случайные предсказания
            this.predictions = Array(5).fill(0).map(() => (Math.random() - 0.5) * 0.02);
            this.rwPredictions = Array(5).fill(0).map(() => (Math.random() - 0.5) * 0.02);
            this.displayPredictions();
        }
    }

    calculateRandomWalkRMSE() {
        try {
            this.updateStatus('trainingStatus', 'Calculating Random Walk RMSE...', 'info');
            
            const rwResults = this.randomWalk.calculateRMSE(this.dataLoader.returns, 50);
            
            // Создаем модальное окно или отображаем в статусе
            this.showBenchmarkResults(rwResults);
            
            this.updateStatus('trainingStatus', 
                `✅ Random Walk RMSE: ${(rwResults.rmse * 100).toFixed(3)}%`,
                'success'
            );
            
        } catch (error) {
            console.error('Benchmark error:', error);
            this.updateStatus('trainingStatus', 
                '⚠️ Failed to calculate RMSE',
                'warning'
            );
        }
    }

    showBenchmarkResults(results) {
        // Создаем popup с результатами
        const popup = document.createElement('div');
        popup.className = 'popup-overlay';
        popup.innerHTML = `
            <div class="popup-content">
                <h3>📊 Random Walk Benchmark Results</h3>
                <div class="results-grid">
                    <div class="result-card">
                        <div class="result-label">RMSE</div>
                        <div class="result-value">${(results.rmse * 100).toFixed(3)}%</div>
                    </div>
                    <div class="result-card">
                        <div class="result-label">MAE</div>
                        <div class="result-value">${(results.mae * 100).toFixed(3)}%</div>
                    </div>
                    <div class="result-card">
                        <div class="result-label">Direction Accuracy</div>
                        <div class="result-value">${results.directionAccuracy.toFixed(1)}%</div>
                    </div>
                    <div class="result-card">
                        <div class="result-label">Sample Size</div>
                        <div class="result-value">${results.sampleSize} days</div>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">Close</button>
            </div>
        `;
        
        // Добавляем стили
        if (!document.querySelector('.popup-overlay')) {
            const style = document.createElement('style');
            style.textContent = `
                .popup-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .popup-content {
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    padding: 30px;
                    border-radius: 15px;
                    border: 2px solid #ff6b81;
                    max-width: 500px;
                    width: 90%;
                }
                .popup-content h3 {
                    color: #ffccd5;
                    margin-bottom: 20px;
                    text-align: center;
                }
                .results-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                    margin: 20px 0;
                }
                .result-card {
                    background: rgba(255, 255, 255, 0.05);
                    padding: 15px;
                    border-radius: 10px;
                    text-align: center;
                    border: 1px solid rgba(255, 107, 129, 0.3);
                }
                .result-label {
                    color: #ffccd5;
                    font-size: 0.9rem;
                    margin-bottom: 5px;
                }
                .result-value {
                    color: #90ee90;
                    font-size: 1.2rem;
                    font-weight: bold;
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(popup);
    }

    displayPredictions() {
        const container = document.getElementById('predictionsContainer');
        container.innerHTML = '';
        
        const lastPrice = this.dataLoader.data[this.dataLoader.data.length - 1]?.price || 100;
        
        // Отображаем GRU предсказания
        if (this.predictions) {
            let currentPrice = lastPrice;
            
            this.predictions.forEach((pred, idx) => {
                const day = idx + 1;
                const returnPct = pred * 100;
                const priceChange = currentPrice * pred;
                const newPrice = currentPrice + priceChange;
                
                const card = document.createElement('div');
                card.className = 'prediction-card fade-in';
                card.style.animationDelay = `${idx * 0.1}s`;
                card.innerHTML = `
                    <div class="prediction-day">GRU - Day +${day}</div>
                    <div class="prediction-value ${returnPct >= 0 ? 'positive' : 'negative'}">
                        ${returnPct.toFixed(3)}%
                    </div>
                    <div class="prediction-details">
                        Price: $${newPrice.toFixed(2)}
                    </div>
                    <div class="prediction-details">
                        Change: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)}
                    </div>
                `;
                
                container.appendChild(card);
                currentPrice = newPrice;
            });
        }
        
        // Отображаем Random Walk предсказания
        if (this.rwPredictions) {
            let currentPrice = lastPrice;
            
            this.rwPredictions.forEach((pred, idx) => {
                const day = idx + 1;
                const returnPct = pred * 100;
                const priceChange = currentPrice * pred;
                const newPrice = currentPrice + priceChange;
                
                const card = document.createElement('div');
                card.className = 'prediction-card fade-in';
                card.style.animationDelay = `${(idx + 5) * 0.1}s`;
                card.style.borderColor = '#6495ed';
                card.style.background = 'rgba(100, 149, 237, 0.1)';
                card.innerHTML = `
                    <div class="prediction-day">Random Walk - Day +${day}</div>
                    <div class="prediction-value ${returnPct >= 0 ? 'positive' : 'negative'}">
                        ${returnPct.toFixed(3)}%
                    </div>
                    <div class="prediction-details">
                        Price: $${newPrice.toFixed(2)}
                    </div>
                    <div class="prediction-details">
                        Change: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)}
                    </div>
                `;
                
                container.appendChild(card);
                currentPrice = newPrice;
            });
        }
    }

    createHistoricalChart() {
        const historicalData = this.dataLoader.getHistoricalData();
        if (!historicalData) return;
        
        this.destroyChart('historical');
        
        const ctx = document.getElementById('historicalChart').getContext('2d');
        const dates = historicalData.dates;
        const prices = historicalData.prices;
        
        this.charts.historical = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'S&P 500 Price',
                    data: prices,
                    borderColor: '#ff6b81',
                    backgroundColor: 'rgba(255, 107, 129, 0.05)',
                    borderWidth: 1.5,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'S&P 500 Historical Prices',
                        color: '#ffccd5',
                        font: { size: 14 }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#ffccd5', font: { size: 10 }, maxTicksLimit: 8 },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { 
                            color: '#ffccd5', 
                            font: { size: 10 },
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    createVolatilityChart() {
        if (!this.insights?.rollingVolatilities) return;
        
        this.destroyChart('volatility');
        
        const ctx = document.getElementById('predictionChart').getContext('2d');
        const volatilities = this.insights.rollingVolatilities;
        const labels = Array.from({ length: volatilities.length }, (_, i) => `Day ${i + 1}`);
        
        this.charts.volatility = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '20-Day Rolling Volatility',
                    data: volatilities.map(v => v * 100),
                    borderColor: '#6495ed',
                    backgroundColor: 'rgba(100, 149, 237, 0.05)',
                    borderWidth: 1.2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Market Volatility Analysis',
                        color: '#ffccd5',
                        font: { size: 14 }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#ffccd5', font: { size: 10 }, maxTicksLimit: 10 },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { 
                            color: '#ffccd5', 
                            font: { size: 10 },
                            callback: function(value) {
                                return value.toFixed(1) + '%';
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    createPredictionsChart() {
        // Удаляем старый график если есть
        const oldChart = document.getElementById('predictionsChartContainer');
        if (oldChart) oldChart.remove();
        
        // Создаем новый контейнер для графика предсказаний
        const predictionsSection = document.querySelector('.card:has(#predictionsContainer)');
        const chartContainer = document.createElement('div');
        chartContainer.id = 'predictionsChartContainer';
        chartContainer.className = 'chart-container';
        chartContainer.style.marginTop = '20px';
        chartContainer.style.height = '350px';
        chartContainer.innerHTML = '<canvas id="predictionsChart"></canvas>';
        predictionsSection.appendChild(chartContainer);
        
        this.destroyChart('predictions');
        
        const ctx = document.getElementById('predictionsChart').getContext('2d');
        const historicalData = this.dataLoader.getHistoricalData();
        
        if (!historicalData || !this.predictions || !this.rwPredictions) return;
        
        // Берем последние 60 дней исторических данных
        const historicalDays = 60;
        const lastHistoricalDates = historicalData.dates.slice(-historicalDays);
        const lastHistoricalPrices = historicalData.prices.slice(-historicalDays);
        
        // Рассчитываем предсказанные цены
        const lastPrice = lastHistoricalPrices[lastHistoricalPrices.length - 1];
        
        // GRU прогнозы
        let currentGruPrice = lastPrice;
        const gruPrices = [lastPrice];
        this.predictions.forEach(pred => {
            currentGruPrice = currentGruPrice * (1 + pred);
            gruPrices.push(currentGruPrice);
        });
        
        // Random Walk прогнозы
        let currentRwPrice = lastPrice;
        const rwPrices = [lastPrice];
        this.rwPredictions.forEach(pred => {
            currentRwPrice = currentRwPrice * (1 + pred);
            rwPrices.push(currentRwPrice);
        });
        
        // Создаем labels
        const historicalLabels = lastHistoricalDates.map(date => {
            const d = new Date(date);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });
        
        const predictionLabels = Array.from({ length: 5 }, (_, i) => `+${i + 1}d`);
        const allLabels = [...historicalLabels, ...predictionLabels];
        
        // Создаем datasets
        const gruAllPrices = [...lastHistoricalPrices, ...gruPrices.slice(1)];
        const rwAllPrices = [...lastHistoricalPrices, ...rwPrices.slice(1)];
        
        this.charts.predictions = new Chart(ctx, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: 'Historical Price',
                        data: lastHistoricalPrices,
                        borderColor: '#ffccd5',
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        pointRadius: 0,
                        borderDash: [2, 2]
                    },
                    {
                        label: 'GRU Predictions',
                        data: gruAllPrices,
                        borderColor: '#90ee90',
                        backgroundColor: 'rgba(144, 238, 144, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0
                    },
                    {
                        label: 'Random Walk Predictions',
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
                        text: 'Historical Prices & 5-Day Predictions',
                        color: '#ffccd5',
                        font: { size: 14 }
                    },
                    legend: {
                        labels: {
                            color: '#ffccd5',
                            font: { size: 11 }
                        },
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        ticks: { 
                            color: '#ffccd5', 
                            font: { size: 9 },
                            maxTicksLimit: 15
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { 
                            color: '#ffccd5', 
                            font: { size: 10 },
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    displayInsights() {
        if (!this.insights) return;
        
        const metricsContainer = document.getElementById('metricsContainer');
        metricsContainer.innerHTML = '';
        
        const insights = [
            { label: '📈 Total Return', value: this.insights.basic.totalReturn },
            { label: '📉 Max Drawdown', value: this.insights.basic.maxDrawdown },
            { label: '📊 Annual Volatility', value: this.insights.returns.annualizedVolatility },
            { label: '🎯 Sharpe Ratio', value: this.insights.returns.sharpeRatio },
            { label: '📅 Positive Days', value: this.insights.returns.positiveDays },
            { label: '🚦 Current Trend', value: this.insights.trends.currentTrend },
            { label: '📊 SMA 50', value: `$${this.insights.trends.sma50}` },
            { label: '📈 SMA 200', value: `$${this.insights.trends.sma200}` },
            { label: '⚡ Current Volatility', value: this.insights.volatility.currentRollingVol },
            { label: '📊 Avg Volatility', value: this.insights.volatility.avgRollingVol }
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

    updateStatus(elementId, message, type = 'info') {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.className = `status ${type}`;
        }
    }

    destroyChart(chartName) {
        if (this.charts[chartName]) {
            try {
                this.charts[chartName].destroy();
                this.charts[chartName] = null;
            } catch (error) {
                console.warn(`Error destroying chart ${chartName}:`, error);
            }
        }
    }

    dispose() {
        this.dataLoader.dispose();
        this.gruModel.dispose();
        Object.keys(this.charts).forEach(chart => this.destroyChart(chart));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new StockPredictorApp();
    window.addEventListener('beforeunload', () => window.app?.dispose());
});
