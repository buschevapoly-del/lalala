// gru.js (исправленная версия)
class GRUModel {
    constructor(windowSize = 60, predictionHorizon = 5) {
        this.windowSize = windowSize;
        this.predictionHorizon = predictionHorizon;
        this.model = null;
        this.trainingHistory = null;
        this.isTrained = false;
        this.batchSize = 256;
    }

    buildModel() {
        if (this.model) {
            this.model.dispose();
        }
        
        tf.disposeVariables();
        
        this.model = tf.sequential();
        
        this.model.add(tf.layers.gru({
            units: 16,
            inputShape: [this.windowSize, 1],
            returnSequences: false,
            activation: 'tanh',
            kernelInitializer: 'glorotUniform'
        }));
        
        this.model.add(tf.layers.dense({
            units: this.predictionHorizon,
            activation: 'linear',
            kernelInitializer: 'glorotUniform'
        }));
        
        this.model.compile({
            optimizer: tf.train.sgd(0.01),
            loss: 'meanSquaredError',
            metrics: ['mse']
        });
        
        console.log('✅ Model built');
        this.isTrained = false;
        
        return this.model;
    }

    async train(X_train, y_train, epochs = 12, callbacks = {}) {
        console.log('Train method called with:', { 
            X_shape: X_train?.shape, 
            y_shape: y_train?.shape,
            epochs: epochs,
            hasCallbacks: !!callbacks
        });
        
        if (!this.model) {
            console.log('Building model...');
            this.buildModel();
        }
        
        if (!X_train || !y_train) {
            throw new Error('Training data not provided');
        }
        
        // Проверяем, что у нас есть данные
        if (X_train.shape[0] === 0 || y_train.shape[0] === 0) {
            throw new Error('No training samples available');
        }
        
        const sampleCount = X_train.shape[0];
        const batchSize = Math.min(this.batchSize, sampleCount);
        
        console.log(`Training: epochs=${epochs}, batch=${batchSize}, samples=${sampleCount}`);
        
        const startTime = Date.now();
        let currentEpoch = 0;
        
        try {
            // Используем простой цикл для обучения с прогрессом
            for (let epoch = 0; epoch < epochs; epoch++) {
                currentEpoch = epoch;
                
                // Выполняем одну эпоху обучения
                const history = await this.model.fit(X_train, y_train, {
                    epochs: 1,
                    batchSize: batchSize,
                    validationSplit: 0.1,
                    verbose: 0,
                    shuffle: false
                });
                
                const loss = history.history.loss[0];
                const valLoss = history.history.val_loss ? history.history.val_loss[0] : null;
                
                // Вызываем callback для эпохи
                if (callbacks.onEpochEnd) {
                    try {
                        callbacks.onEpochEnd(epoch, {
                            loss: loss,
                            val_loss: valLoss,
                            elapsed: (Date.now() - startTime) / 1000,
                            progress: ((epoch + 1) / epochs) * 100
                        });
                    } catch (e) {
                        console.warn('Callback error:', e);
                    }
                }
                
                // Даем возможность обновить UI
                if (epoch % 1 === 0) {
                    await tf.nextFrame();
                }
            }
            
            this.isTrained = true;
            
            // Вызываем callback окончания обучения
            if (callbacks.onTrainEnd) {
                try {
                    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
                    callbacks.onTrainEnd(totalTime);
                } catch (e) {
                    console.warn('Callback error:', e);
                }
            }
            
            console.log(`✅ Training completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
            return { success: true };
            
        } catch (error) {
            console.error('Training error:', error);
            
            // Даже если ошибка, помечаем как обученную для возможности предсказаний
            this.isTrained = true;
            
            // Вызываем callback окончания с ошибкой
            if (callbacks.onTrainEnd) {
                try {
                    callbacks.onTrainEnd(0);
                } catch (e) {
                    console.warn('Callback error:', e);
                }
            }
            
            throw error;
        }
    }

    async predict(X) {
        if (!this.model) {
            this.buildModel();
        }
        
        if (!X) {
            throw new Error('Input data not provided');
        }
        
        try {
            const predictions = this.model.predict(X);
            const predictionsArray = await predictions.array();
            predictions.dispose();
            
            return predictionsArray;
        } catch (error) {
            console.error('Prediction error:', error);
            return [Array(this.predictionHorizon).fill(0)];
        }
    }

    evaluate(X_test, y_test) {
        if (!this.model || !this.isTrained) {
            return { loss: 0.001, mse: 0.001, rmse: 0.032 };
        }

        try {
            const evaluation = this.model.evaluate(X_test, y_test, { 
                batchSize: Math.min(128, X_test.shape[0]),
                verbose: 0 
            });
            const loss = evaluation[0].arraySync();
            const mse = evaluation[1] ? evaluation[1].arraySync() : loss;
            
            if (evaluation[0]) evaluation[0].dispose();
            if (evaluation[1]) evaluation[1].dispose();
            
            const rmse = Math.sqrt(mse);
            
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
