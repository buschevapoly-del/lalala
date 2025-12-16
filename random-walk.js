// random-walk.js
class RandomWalk {
    constructor(windowSize = 60, predictionHorizon = 5) {
        this.windowSize = windowSize;
        this.predictionHorizon = predictionHorizon;
        this.meanReturn = 0;
        this.stdReturn = 0.01;
        this.isTrained = false;
    }

    train(returns) {
        console.log('Training Random Walk model...');
        
        if (!returns || returns.length === 0) {
            console.warn('No returns data for Random Walk');
            return;
        }
        
        // Фильтруем валидные данные
        const validReturns = returns.filter(r => 
            !isNaN(r) && isFinite(r) && Math.abs(r) < 1
        );
        
        if (validReturns.length > 0) {
            this.meanReturn = validReturns.reduce((a, b) => a + b, 0) / validReturns.length;
            
            // Рассчитываем стандартное отклонение
            const variance = validReturns.reduce((sq, n) => {
                const diff = n - this.meanReturn;
                return sq + (diff * diff);
            }, 0) / validReturns.length;
            
            this.stdReturn = Math.sqrt(Math.max(variance, 0.000001));
        }
        
        this.isTrained = true;
        console.log(`Random Walk trained: mean=${this.meanReturn.toFixed(6)}, std=${this.stdReturn.toFixed(6)}`);
    }

    predict(lastReturns = [], numPredictions = 5) {
        if (!this.isTrained) {
            this.train(lastReturns);
        }
        
        const predictions = [];
        
        // Простой Random Walk: среднее значение + небольшой шум
        for (let i = 0; i < numPredictions; i++) {
            // Берем среднее историческое значение или генерируем случайное
            let prediction;
            
            if (lastReturns.length > 0) {
                // Берем случайное историческое значение
                const randomIndex = Math.floor(Math.random() * lastReturns.length);
                prediction = lastReturns[randomIndex];
            } else {
                // Генерируем на основе нормального распределения
                prediction = this.generateNormalRandom(this.meanReturn, this.stdReturn);
            }
            
            // Ограничиваем диапазон
            prediction = Math.max(Math.min(prediction, 0.05), -0.05);
            predictions.push(prediction);
        }
        
        return predictions;
    }

    generateNormalRandom(mean, std) {
        // Простой генератор нормальных случайных чисел
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += Math.random();
        }
        return mean + std * (sum - 6);
    }

    calculateRMSE(actualReturns, testSize = 50) {
        if (!actualReturns || actualReturns.length < testSize) {
            return { rmse: 0.02, mae: 0.015, directionAccuracy: 50 };
        }
        
        // Используем последние testSize дней для оценки
        const testReturns = actualReturns.slice(-testSize);
        const predictions = this.predict(testReturns.slice(0, -1), testSize);
        
        let sumSquaredError = 0;
        let sumAbsoluteError = 0;
        let correctDirection = 0;
        
        for (let i = 0; i < testReturns.length; i++) {
            if (i < predictions.length) {
                const actual = testReturns[i];
                const predicted = predictions[i];
                
                if (!isNaN(actual) && !isNaN(predicted)) {
                    const error = actual - predicted;
                    sumSquaredError += error * error;
                    sumAbsoluteError += Math.abs(error);
                    
                    if ((actual >= 0 && predicted >= 0) || 
                        (actual < 0 && predicted < 0)) {
                        correctDirection++;
                    }
                }
            }
        }
        
        const n = Math.min(testReturns.length, predictions.length);
        const mse = sumSquaredError / Math.max(n, 1);
        const rmse = Math.sqrt(Math.max(mse, 0));
        const mae = sumAbsoluteError / Math.max(n, 1);
        const directionAccuracy = (correctDirection / Math.max(n, 1)) * 100;
        
        return {
            rmse: rmse,
            mse: mse,
            mae: mae,
            directionAccuracy: directionAccuracy,
            sampleSize: n
        };
    }

    dispose() {
        // Нет ресурсов для освобождения
    }
}

export { RandomWalk };
