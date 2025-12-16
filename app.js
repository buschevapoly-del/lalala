// app.js (обновленная версия с Random Walk и новой диаграммой)
import { DataLoader } from './data-loader.js';
import { GRUModel } from './gru.js';
import { RandomWalk } from './random-walk.js';

class StockPredictorApp {
    constructor() {
        this.dataLoader = new DataLoader();
        this.gruModel = new GRUModel();
        this.randomWalk = new RandomWalk();
        this.charts = {
            combined: null,
            volatility: null,
            comparison: null,
            predictionsChart: null,
            benchmark: null
        };
        this.isTraining = false;
        this.predictions = null;
        this.randomWalkPredictions = null;
        this.insights = null;
        this.isModelTrained = false;
        this.benchmarkResults = null;
        
        this.initUI();
        this.setupEventListeners();
        this.autoLoadData();
    }

    initUI() {
        document.getElementById('dataStatus').textContent = '🚀 Loading data...';
        document.getElementById('trainingStatus').textContent = 'Model will auto-train with 5 epochs';
        
        // Скрываем элементы связанные с тренировкой
        const epochsInput = document.getElementById('epochs');
        const trainBtn = document.getElementById('trainBtn');
        if (epochsInput) epochsInput.style.display = 'none';
        if (trainBtn) trainBtn.style.display = 'none';
        
        // Меняем текст кнопки предсказаний
        const predictBtn = document.getElementById('predictBtn');
        if (predictBtn) {
            predictBtn.textContent = '🔮 Show Predictions & Benchmarks';
            predictBtn.disabled = true;
        }
    }

    setupEventListeners() {
        document.getElementById('loadDataBtn').addEventListener('click', () => this.loadData());
        document.getElementById('viewDataBtn').addEventListener('click', () => this.displayInsights());
        document.getElementById('predictBtn').addEventListener('click', () => this.autoTrainAndPredict());
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

    async autoLoadData() {
        try {
            await this.dataLoader.loadCSVFromGitHub();
            this.dataLoader.prepareData();
            
            document.getElementById('viewDataBtn').disabled = false;
            document.getElementById('predictBtn').disabled = false;
            document.getElementById('loadDataBtn').innerHTML = '🔄 Reload Data';
            
            this.insights = this.dataLoader.getInsights();
            this.displayInsights();
            this.createCombinedChart();
            
            this.updateStatus('dataStatus', '✅ Data loaded! Click "Show Predictions"', 'success');
            
            // Train Random Walk
            this.trainRandomWalk();
            
            // Автотреннинг модели при загрузке данных
            await this.autoTrainModel();
            
        } catch (error) {
            this.updateStatus('dataStatus', `❌ ${error.message}`, 'error');
        }
    }

    trainRandomWalk() {
        if (!this.dataLoader.returns || this.dataLoader.returns.length === 0) return;
        
        try {
            this.randomWalk.train(this.dataLoader.returns);
            console.log('✅ Random Walk model trained');
        } catch (error) {
            console.error('Random Walk training error:', error);
        }
    }

    async loadData() {
        try {
            this.updateStatus('dataStatus', 'Reloading...', 'info');
            this.dataLoader.dispose();
            this.gruModel.dispose();
            this.isModelTrained = false;
            this.benchmarkResults = null;
            
            // Уничтожаем все графики
            Object.keys(this.charts).forEach(chart => this.destroyChart(chart));
            
            await this.dataLoader.loadCSVFromGitHub();
            this.dataLoader.prepareData();
            
            this.insights = this.dataLoader.getInsights();
            this.displayInsights();
            this.createCombinedChart();
            
            // Train Random Walk
            this.trainRandomWalk();
            
            this.updateStatus('dataStatus', '✅ Data reloaded!', 'success');
            
            // Автотреннинг модели после перезагрузки данных
            await this.autoTrainModel();
            
        } catch (error) {
            this.updateStatus('dataStatus', `❌ ${error.message}`, 'error');
        }
    }

    async autoTrainModel() {
        if (this.isTraining || this.isModelTrained) return;
        
        try {
            this.isTraining = true;
            const epochs = 8; // Уменьшено для скорости, но достаточно для хороших результатов
            
            this.updateStatus('trainingStatus', '🚀 Training improved GRU model...', 'info');
            
            // Ensure data is ready
            if (!this.dataLoader.X_train || !this.dataLoader.y_train) {
                throw new Error('Training data not available.');
            }
            
            const callbacks = {
                onEpochEnd: (epoch, logs) => {
                    const lossMsg = logs.loss ? `Loss: ${logs.loss.toFixed(6)}` : '';
                    const valLossMsg = logs.val_loss ? `Val: ${logs.val_loss.toFixed(6)}` : '';
                    this.updateStatus('trainingStatus', 
                        `⚡ Training ${epoch + 1}/${epochs} ${lossMsg} ${valLossMsg}`,
                        'info'
                    );
                },
                onTrainEnd: (totalTime, metrics) => {
                    this.isTraining = false;
                    this.isModelTrained = true;
                    const rmseMsg = metrics?.rmse ? `(RMSE: ${(metrics.rmse * 100).toFixed(3)}%)` : '';
                    this.updateStatus('trainingStatus', 
                        `✅ GRU model trained! ${rmseMsg}`,
                        'success'
                    );
                }
            };
            
            await this.gruModel.train(this.dataLoader.X_train, this.dataLoader.y_train, epochs, callbacks);
            
            // Оцениваем модель
            const evaluation = this.gruModel.evaluate(this.dataLoader.X_test, this.dataLoader.y_test);
            if (evaluation) {
                console.log('GRU Evaluation:', evaluation);
                this.gruEvaluation = evaluation;
            }
            
        } catch (error) {
            this.isTraining = false;
            this.isModelTrained = false;
            console.error('Training error:', error);
            this.updateStatus('trainingStatus', 
                `⚠️ Training failed: ${error.message}`,
                'warning'
            );
        }
    }

    async autoTrainAndPredict() {
        if (!this.isModelTrained) {
            await this.autoTrainModel();
        }
        
        if (this.isModelTrained) {
            await this.makePredictions();
            await this.runBenchmark();
            this.displayBenchmarkResults();
            this.createPredictionsChart();
        } else {
            this.updateStatus('trainingStatus', 
                '⚠️ Model not trained yet. Please wait...',
                'warning'
            );
        }
    }

    async makePredictions() {
        try {
            this.updateStatus('trainingStatus', 'Generating predictions...', 'info');
            
            const normalizedData = this.dataLoader.normalizedData;
            const windowSize = this.gruModel.windowSize;
            
            if (!normalizedData || normalizedData.length < windowSize) {
                throw new Error('Not enough data');
            }
            
            // GRU predictions
            const lastWindow = normalizedData.slice(-windowSize);
            const lastWindowFormatted = lastWindow.map(v => [v]);
            const inputTensor = tf.tensor3d([lastWindowFormatted], [1, windowSize, 1]);
            
            const normalizedPredictions = await this.gruModel.predict(inputTensor);
            inputTensor.dispose();
            
            this.predictions = normalizedPredictions[0].map(p => 
                this.dataLoader.denormalize(p)
            );
            
            // Random Walk predictions
            const lastReturns = this.dataLoader.returns.slice(-windowSize);
            this.randomWalkPredictions = this.randomWalk.predict(lastReturns, 5);
            
            console.log('GRU Predictions:', this.predictions);
            console.log('Random Walk Predictions:', this.randomWalkPredictions);
            
            this.displayPredictions();
            
            this.updateStatus('trainingStatus', '✅ Predictions generated!', 'success');
            
        } catch (error) {
            this.updateStatus('trainingStatus', `⚠️ ${error.message}`, 'warning');
            console.error('Prediction error:', error);
        }
    }

    async runBenchmark() {
        if (!this.dataLoader.returns || this.dataLoader.returns.length === 0) return;
        
        try {
            // Use last 100 days for benchmark
            const testReturns = this.dataLoader.returns.slice(-100);
            
            // Generate GRU predictions for benchmark
            const gruPredictions = [];
            const windowSize = this.gruModel.windowSize;
            
            // We need to prepare data for GRU similar to training
            for (let i = 0; i < testReturns.length - windowSize - 4; i++) {
                const window = this.dataLoader.normalizedData.slice(
                    this.dataLoader.normalizedData.length - testReturns.length + i,
                    this.dataLoader.normalizedData.length - testReturns.length + i + windowSize
                );
                
                if (window.length === windowSize) {
                    const inputTensor = tf.tensor3d([window.map(v => [v])], [1, windowSize, 1]);
                    const pred = await this.gruModel.predict(inputTensor);
                    const denormPred = pred[0].map(p => this.dataLoader.denormalize(p));
                    gruPredictions.push(denormPred[0]); // Take only first day prediction
                    inputTensor.dispose();
                    pred.dispose();
                }
            }
            
            // Get corresponding actual returns
            const actualReturns = testReturns.slice(windowSize, windowSize + gruPredictions.length);
            
            // Evaluate GRU
            const gruEvaluation = {
                rmse: Math.sqrt(
                    gruPredictions.reduce((sum, pred, i) => 
                        sum + Math.pow(pred - actualReturns[i], 2), 0) / gruPredictions.length
                ),
                mae: gruPredictions.reduce((sum, pred, i) => 
                    sum + Math.abs(pred - actualReturns[i]), 0) / gruPredictions.length,
                directionAccuracy: (gruPredictions.reduce((acc, pred, i) => 
                    acc + ((pred >= 0 && actualReturns[i] >= 0) || (pred < 0 && actualReturns[i] < 0) ? 1 : 0), 0) / gruPredictions.length * 100)
            };
            
            // Evaluate Random Walk
            const rwEvaluation = this.randomWalk.evaluate(actualReturns, 
                this.randomWalk.predict(actualReturns, actualReturns.length).predictedReturns
            );
            
            this.benchmarkResults = {
                gru: gruEvaluation,
                randomWalk: rwEvaluation,
                comparison: {
                    rmseImprovement: ((rwEvaluation.rmse - gruEvaluation.rmse) / rwEvaluation.rmse * 100).toFixed(1),
                    maeImprovement: ((rwEvaluation.mae - gruEvaluation.mae) / rwEvaluation.mae * 100).toFixed(1),
                    accuracyImprovement: (gruEvaluation.directionAccuracy - rwEvaluation.directionAccuracy).toFixed(1)
                }
            };
            
            console.log('Benchmark Results:', this.benchmarkResults);
            
        } catch (error) {
            console.error('Benchmark error:', error);
        }
    }

    displayBenchmarkResults() {
        if (!this.benchmarkResults) return;
        
        const metricsContainer = document.getElementById('metricsContainer');
        
        // Добавляем карточки с результатами бенчмарка
        const benchmarkCards = [
            {
                label: '📊 GRU RMSE',
                value: (this.benchmarkResults.gru.rmse * 100).toFixed(3) + '%',
                color: 'positive'
            },
            {
                label: '🎲 Random Walk RMSE',
                value: (this.benchmarkResults.randomWalk.rmse * 100).toFixed(3) + '%',
                color: 'negative'
            },
            {
                label: '⚡ RMSE Improvement',
                value: this.benchmarkResults.comparison.rmseImprovement + '%',
                color: 'positive'
            },
            {
                label: '🎯 GRU Direction Accuracy',
                value: this.benchmarkResults.gru.directionAccuracy.toFixed(1) + '%',
                color: 'positive'
            },
            {
                label: '🎲 RW Direction Accuracy',
                value: this.benchmarkResults.randomWalk.directionAccuracy.toFixed(1) + '%',
                color: 'negative'
            },
            {
                label: '🚀 Accuracy Improvement',
                value: this.benchmarkResults.comparison.accuracyImprovement + '%',
                color: 'positive'
            }
        ];
        
        benchmarkCards.forEach((card, index) => {
            const existingCard = metricsContainer.children[index + 10]; // После существующих инсайтов
            if (existingCard) {
                existingCard.querySelector('.insight-value').textContent = card.value;
                existingCard.querySelector('.insight-label').textContent = card.label;
                existingCard.querySelector('.insight-value').className = `insight-value ${card.color}`;
            } else {
                const newCard = document.createElement('div');
                newCard.className = 'insight-card fade-in';
                newCard.innerHTML = `
                    <div class="insight-value ${card.color}">${card.value}</div>
                    <div class="insight-label">${card.label}</div>
                `;
                metricsContainer.appendChild(newCard);
            }
        });
        
        // Создаем график сравнения моделей
        this.createBenchmarkChart();
    }

    displayInsights() {
        if (!this.insights) return;
        
        const metricsContainer = document.getElementById('metricsContainer');
        metricsContainer.innerHTML = '';
        metricsContainer.style.display = 'grid';
        
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
        
        this.createVolatilityChart();
    }

    createCombinedChart() {
        // Оставляем без изменений
        const historicalData = this.dataLoader.getHistoricalData();
        if (!historicalData) return;
        
        this.destroyChart('combined');
        
        const ctx = document.getElementById('historicalChart').getContext('2d');
        
        const dates = historicalData.dates;
        const prices = historicalData.prices;
        const sma50 = this.insights?.sma50 || [];
        const sma200 = this.insights?.sma200 || [];
        
        const sma50Data = [...Array(dates.length - sma50.length).fill(null), ...sma50];
        const sma200Data = [...Array(dates.length - sma200.length).fill(null), ...sma200];
        
        this.charts.combined = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'S&P 500 Price',
                        data: prices,
                        borderColor: '#ff6b81',
                        backgroundColor: 'rgba(255, 107, 129, 0.05)',
                        borderWidth: 1.5,
                        fill: true,
                        tension: 0.1,
                        pointRadius: 0,
                        pointHoverRadius: 3
                    },
                    {
                        label: 'SMA 50',
                        data: sma50Data,
                        borderColor: '#90ee90',
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        tension: 0.1,
                        borderDash: [3, 3],
                        pointRadius: 0
                    },
                    {
                        label: 'SMA 200',
                        data: sma200Data,
                        borderColor: '#6495ed',
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        tension: 0.1,
                        borderDash: [3, 3],
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    title: {
                        display: true,
                        text: 'S&P 500 with Moving Averages',
                        color: '#ffccd5',
                        font: { size: 14, weight: 'normal' }
                    },
                    legend: {
                        labels: {
                            color: '#ffccd5',
                            font: { size: 11 },
                            usePointStyle: true,
                            pointStyle: 'line'
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
                        usePointStyle: true,
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label && context.parsed.y !== null) {
                                    label += ': $' + context.parsed.y.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    });
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
                        text: 'Market Volatility Analysis',
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
                        borderColor: '#6495ed',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `Volatility: ${context.parsed.y.toFixed(2)}%`;
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

    createBenchmarkChart() {
        if (!this.benchmarkResults) return;
        
        const existingChart = this.charts.benchmark;
        if (existingChart) {
            existingChart.destroy();
        }
        
        // Создаем новый контейнер для графика если нужно
        const chartsGrid = document.querySelector('.charts-grid');
        const existingBenchmarkCard = document.querySelector('#benchmarkCard');
        
        if (!existingBenchmarkCard) {
            const newCard = document.createElement('div');
            newCard.className = 'card fade-in';
            newCard.id = 'benchmarkCard';
            newCard.innerHTML = `
                <h2 class="card-title">📊 Model Comparison</h2>
                <div class="chart-container">
                    <canvas id="benchmarkChart"></canvas>
                </div>
                <div class="performance-badge badge-accurate" style="margin-top: 15px;">
                    🏆 GRU vs Random Walk Performance
                </div>
            `;
            chartsGrid.appendChild(newCard);
        }
        
        const ctx = document.getElementById('benchmarkChart').getContext('2d');
        
        const labels = ['RMSE (Lower is better)', 'MAE (Lower is better)', 'Direction Accuracy (Higher is better)'];
        const gruData = [
            this.benchmarkResults.gru.rmse * 100,
            this.benchmarkResults.gru.mae * 100,
            this.benchmarkResults.gru.directionAccuracy
        ];
        const rwData = [
            this.benchmarkResults.randomWalk.rmse * 100,
            this.benchmarkResults.randomWalk.mae * 100,
            this.benchmarkResults.randomWalk.directionAccuracy
        ];
        
        this.charts.benchmark = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'GRU Model',
                        data: gruData,
                        backgroundColor: 'rgba(144, 238, 144, 0.7)',
                        borderColor: '#90ee90',
                        borderWidth: 1
                    },
                    {
                        label: 'Random Walk',
                        data: rwData,
                        backgroundColor: 'rgba(255, 107, 129, 0.7)',
                        borderColor: '#ff6b81',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Model Performance Comparison',
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
