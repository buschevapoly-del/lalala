// random-walk.js
class RandomWalk {
    constructor(windowSize = 60, predictionHorizon = 5) {
        this.windowSize = windowSize;
        this.predictionHorizon = predictionHorizon;
    }

    train(returns) {
        // Random Walk doesn't need training, just store statistics
        if (!returns || returns.length === 0) {
            throw new Error('No returns data available');
        }
        
        this.meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        this.stdReturn = Math.sqrt(
            returns.reduce((sq, n) => sq + Math.pow(n - this.meanReturn, 2), 0) / returns.length
        );
        
        console.log(`Random Walk stats: mean=${this.meanReturn.toFixed(6)}, std=${this.stdReturn.toFixed(6)}`);
    }

    predict(lastReturns, numPredictions = 5) {
        if (!this.meanReturn !== undefined || !this.stdReturn !== undefined) {
            throw new Error('Random Walk not trained. Call train() first.');
        }
        
        const predictions = [];
        
        // For Random Walk, each prediction is independent
        for (let i = 0; i < numPredictions; i++) {
            // Generate random return based on historical distribution
            // Using normal distribution with historical mean and std
            const randomReturn = this.generateNormalRandom(this.meanReturn, this.stdReturn);
            predictions.push(randomReturn);
        }
        
        return predictions;
    }

    generateNormalRandom(mean, std) {
        // Box-Muller transform for generating normal random numbers
        let u = 0, v = 0;
        while(u === 0) u = Math.random();
        while(v === 0) v = Math.random();
        
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + std * z;
    }

    evaluate(actualReturns, predictedReturns) {
        if (actualReturns.length !== predictedReturns.length) {
            throw new Error('Actual and predicted returns must have same length');
        }
        
        const n = actualReturns.length;
        
        // Calculate RMSE
        const squaredErrors = [];
        for (let i = 0; i < n; i++) {
            const error = actualReturns[i] - predictedReturns[i];
            squaredErrors.push(error * error);
        }
        
        const mse = squaredErrors.reduce((a, b) => a + b, 0) / n;
        const rmse = Math.sqrt(mse);
        
        // Calculate MAE
        const mae = actualReturns.reduce((sum, actual, i) => 
            sum + Math.abs(actual - predictedReturns[i]), 0) / n;
        
        // Calculate directional accuracy
        let correctDirection = 0;
        for (let i = 0; i < n; i++) {
            if ((actualReturns[i] >= 0 && predictedReturns[i] >= 0) || 
                (actualReturns[i] < 0 && predictedReturns[i] < 0)) {
                correctDirection++;
            }
        }
        const directionAccuracy = (correctDirection / n) * 100;
        
        return {
            rmse: rmse,
            mse: mse,
            mae: mae,
            directionAccuracy: directionAccuracy,
            actualReturns: actualReturns,
            predictedReturns: predictedReturns
        };
    }

    benchmark(actualReturns) {
        // Generate Random Walk predictions for all historical data
        const predictions = this.predict(actualReturns, actualReturns.length);
        return this.evaluate(actualReturns, predictions);
    }

    dispose() {
        // No resources to dispose
    }
}

export { RandomWalk };
