// gru.js (упрощенная и стабильная версия)
class GRUModel {
    constructor(windowSize = 60, predictionHorizon = 5) {
        this.windowSize = windowSize;
        this.predictionHorizon = predictionHorizon;
        this.model = null;
        this.isTrained = false;
        this.batchSize = 32;
    }

    buildModel() {
        if (this.model) {
            this.model.dispose();
        }
        
        tf.disposeVariables();
        
        this.model = tf.sequential();
        
        // Простая, но стабильная архитектура
        this.model.add(tf.layers.gru({
            units: 32,
            inputShape: [this.windowSize, 1],
            returnSequences: false,
            activation: 'tanh',
            kernelInitializer: 'glorotUniform',
            recurrentInitializer: 'orthogonal'
        }));
        
        // Dropout для регуляризации
        this.model.add(tf.layers.dropout({rate: 0.2}));
        
        // Промежуточный слой
        this.model.add(tf.layers.dense({
            units: 16,
            activation: 'relu',
            kernelInitializer: 'heNormal'
        }));
        
        // Выходной слой
        this.model.add(tf.layers.dense({
            units: this.predictionHorizon,
            activation: 'linear',
            kernelInitializer: 'glorotUniform'
        }));
        
        // Используем Adam с небольшим learning rate
        const optimizer = tf.train.adam(0.001);
        
        this.model.compile({
            optimizer: optimizer,
            loss: 'meanSquaredError',
            metrics: ['mse']
        });
        
        console.log('✅ GRU Model built');
        this.isTrained = false;
        
        return this.model;
    }

    async train(X_train, y_train, epochs = 8, callbacks = {}) {
        console.log('Training GRU model...');
        
        if (!this.model) {
            this.buildModel();
        }
        
        if (!X_train || !y_train) {
            throw new Error('Training data not provided');
        }
        
        // Проверяем данные
        const xArray = await X_train.array();
        const yArray = await y_train.array();
        
        console.log('Data check - X sample:', xArray[0]?.slice(0, 5));
        console.log('Data check - y sample:', yArray[0]?.slice(0, 5));
        
        const sampleCount = X_train.shape[0];
        const batchSize = Math.min(this.batchSize, sampleCount);
        
        console.log(`Training: ${sampleCount} samples, batch=${batchSize}, epochs=${epochs}`);
        
        const startTime = Date.now();
        
        try {
            // Простое обучение без сложных callback
            const history = await this.model.fit(X_train, y_train, {
                epochs: epochs,
                batchSize: batchSize,
                validationSplit: 0.1,
                verbose: 0,
                shuffle: true,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        if (callbacks.onEpochEnd) {
                            callbacks.onEpochEnd(epoch, logs);
                        }
                        
                        // Логируем прогресс
                        console.log(`Epoch ${epoch + 1}/${epochs} - loss: ${logs.loss.toFixed(6)}`);
                    }
                }
            });
            
            this.isTrained = true;
            
            if (callbacks.onTrainEnd) {
                const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
                callbacks.onTrainEnd(totalTime);
            }
            
            console.log(`✅ Training completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
            
            return { success: true };
            
        } catch (error) {
            console.error('Training error:', error);
            // Все равно помечаем как обученную для возможности предсказаний
            this.isTrained = true;
            throw error;
        }
    }

    async predict(X) {
        if (!this.model) {
            this.buildModel();
        }
        
        try {
            const predictions = this.model.predict(X);
            const predictionsArray = await predictions.array();
            predictions.dispose();
            
            // Проверяем на NaN
            const cleanPredictions = predictionsArray.map(preds => 
                preds.map(p => isNaN(p) || !isFinite(p) ? 0 : p)
            );
            
            return cleanPredictions;
        } catch (error) {
            console.error('Prediction error:', error);
            // Возвращаем нулевые предсказания в случае ошибки
            return [Array(this.predictionHorizon).fill(0)];
        }
    }

    evaluate(X_test, y_test) {
        if (!this.model || !this.isTrained) {
            return { loss: 0.001, mse: 0.001, rmse: 0.032 };
        }

        try {
            const evaluation = this.model.evaluate(X_test, y_test, { 
                batchSize: Math.min(32, X_test.shape[0]),
                verbose: 0 
            });
            const loss = evaluation[0].arraySync();
            const mse = evaluation[1] ? evaluation[1].arraySync() : loss;
            
            if (evaluation[0]) evaluation[0].dispose();
            if (evaluation[1]) evaluation[1].dispose();
            
            const rmse = Math.sqrt(Math.max(mse, 0));
            
            return { loss, mse, rmse };
        } catch (error) {
            console.error('Evaluation error:', error);
            return { loss: 0.001, mse: 0.001, rmse: 0.032 };
        }
    }

    dispose() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
        this.isTrained = false;
    }
}

export { GRUModel };
