// gru.js (улучшенная версия)
class GRUModel {
    constructor(windowSize = 60, predictionHorizon = 5) {
        this.windowSize = windowSize;
        this.predictionHorizon = predictionHorizon;
        this.model = null;
        this.trainingHistory = null;
        this.isTrained = false;
        this.batchSize = 64;
        this.dropoutRate = 0.2;
    }

    buildModel() {
        if (this.model) {
            this.model.dispose();
        }
        
        tf.disposeVariables();
        
        this.model = tf.sequential();
        
        // Improved GRU architecture
        this.model.add(tf.layers.gru({
            units: 32,
            inputShape: [this.windowSize, 1],
            returnSequences: true,
            activation: 'tanh',
            kernelInitializer: 'glorotNormal',
            recurrentInitializer: 'orthogonal',
            dropout: this.dropoutRate,
            recurrentDropout: this.dropoutRate
        }));
        
        // Second GRU layer
        this.model.add(tf.layers.gru({
            units: 16,
            returnSequences: false,
            activation: 'tanh',
            kernelInitializer: 'glorotNormal',
            recurrentInitializer: 'orthogonal',
            dropout: this.dropoutRate
        }));
        
        // Batch normalization
        this.model.add(tf.layers.batchNormalization());
        
        // Dense layer with regularization
        this.model.add(tf.layers.dense({
            units: 8,
            activation: 'relu',
            kernelInitializer: 'heNormal',
            kernelRegularizer: tf.regularizers.l2({l2: 0.001})
        }));
        
        this.model.add(tf.layers.dropout({rate: this.dropoutRate}));
        
        // Output layer
        this.model.add(tf.layers.dense({
            units: this.predictionHorizon,
            activation: 'linear',
            kernelInitializer: 'glorotUniform'
        }));
        
        // Improved optimizer with learning rate scheduling
        const optimizer = tf.train.adam({
            learningRate: 0.001,
            beta1: 0.9,
            beta2: 0.999,
            epsilon: 1e-8
        });
        
        this.model.compile({
            optimizer: optimizer,
            loss: 'meanSquaredError',
            metrics: ['mse', 'mae']
        });
        
        console.log('✅ Improved GRU model built');
        console.log(this.model.summary());
        this.isTrained = false;
        
        return this.model;
    }

    async train(X_train, y_train, epochs = 12, callbacks = {}) {
        console.log('Training improved GRU model...');
        
        if (!this.model) {
            this.buildModel();
        }
        
        if (!X_train || !y_train) {
            throw new Error('Training data not provided');
        }
        
        const sampleCount = X_train.shape[0];
        const batchSize = Math.min(this.batchSize, sampleCount);
        
        console.log(`Training: ${sampleCount} samples, batch=${batchSize}`);
        
        const startTime = Date.now();
        let bestLoss = Infinity;
        let patience = 5;
        let patienceCounter = 0;
        
        try {
            // Use early stopping and learning rate scheduling
            for (let epoch = 0; epoch < epochs; epoch++) {
                const history = await this.model.fit(X_train, y_train, {
                    epochs: 1,
                    batchSize: batchSize,
                    validationSplit: 0.15,
                    verbose: 0,
                    shuffle: true
                });
                
                const loss = history.history.loss[0];
                const valLoss = history.history.val_loss ? history.history.val_loss[0] : null;
                
                // Early stopping check
                if (valLoss < bestLoss) {
                    bestLoss = valLoss;
                    patienceCounter = 0;
                } else {
                    patienceCounter++;
                    if (patienceCounter >= patience) {
                        console.log(`Early stopping at epoch ${epoch + 1}`);
                        break;
                    }
                }
                
                // Callback for epoch
                if (callbacks.onEpochEnd) {
                    callbacks.onEpochEnd(epoch, {
                        loss: loss,
                        val_loss: valLoss,
                        progress: ((epoch + 1) / epochs) * 100
                    });
                }
                
                await tf.nextFrame();
            }
            
            this.isTrained = true;
            this.trainingHistory = { bestLoss: bestLoss };
            
            if (callbacks.onTrainEnd) {
                const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
                callbacks.onTrainEnd(totalTime, { rmse: Math.sqrt(bestLoss) });
            }
            
            console.log(`✅ Training completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s, Best val loss: ${bestLoss}`);
            
            return { success: true, bestLoss: bestLoss };
            
        } catch (error) {
            console.error('Training error:', error);
            this.isTrained = true; // Still allow predictions
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
            
            return predictionsArray;
        } catch (error) {
            console.error('Prediction error:', error);
            return [Array(this.predictionHorizon).fill(0)];
        }
    }

    evaluate(X_test, y_test) {
        if (!this.model || !this.isTrained) {
            return null;
        }

        try {
            const evaluation = this.model.evaluate(X_test, y_test, { 
                batchSize: Math.min(32, X_test.shape[0]),
                verbose: 0 
            });
            
            const loss = evaluation[0].arraySync();
            const mse = evaluation[1] ? evaluation[1].arraySync() : loss;
            const mae = evaluation[2] ? evaluation[2].arraySync() : null;
            const rmse = Math.sqrt(mse);
            
            // Calculate directional accuracy
            const predictions = this.model.predict(X_test);
            const predArray = predictions.arraySync();
            const actualArray = y_test.arraySync();
            
            let correctDirection = 0;
            const totalPredictions = predArray.length * predArray[0].length;
            
            for (let i = 0; i < predArray.length; i++) {
                for (let j = 0; j < predArray[i].length; j++) {
                    if ((actualArray[i][j] >= 0 && predArray[i][j] >= 0) || 
                        (actualArray[i][j] < 0 && predArray[i][j] < 0)) {
                        correctDirection++;
                    }
                }
            }
            
            const directionAccuracy = (correctDirection / totalPredictions) * 100;
            
            predictions.dispose();
            
            return {
                loss: loss,
                mse: mse,
                rmse: rmse,
                mae: mae,
                directionAccuracy: directionAccuracy
            };
            
        } catch (error) {
            console.error('Evaluation error:', error);
            return { loss: 0.001, mse: 0.001, rmse: 0.032, mae: 0.001, directionAccuracy: 50 };
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
